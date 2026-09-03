# Worker Brief: W2B — Attorney schedule, reschedule requests, staff request queue

You are a Codex CLI implementation worker. Work only inside your worktree. Do not spawn
subagents. Finish with a commit.

A reviewer will adversarially test this. It exposes participant data to a new role.

## Goal

A signed-in attorney sees only their own current interviews, can print them, and can ask
staff to reschedule one. Staff get a queue where they review, decline, or resolve a request
by actually moving the booking. **The existing booking survives until staff resolve it.**

Approved scope: `docs/campaign-hq/APPROVED-PLAN.md` §4 (portal, print) and §5
(staff-reviewed rescheduling). Direct attorney↔company messaging is explicitly **out of
scope**.

## Base

- Branch: `codex/w2b-attorney-schedule`
- Worktree: `WORKTREE`
- Base commit: `BASE_COMMIT` (W2 foundation)

## Required reading before you edit

`work/reviews/auth-scheduling-precheck.md`, findings **1**, **5**, and **6**. They are
binding requirements and their "Acceptance" paragraphs describe how you will be tested.

## Environment facts

- Next.js **16.1.6**, App Router, TypeScript strict, Drizzle ORM.
- `drizzle-orm/neon-http` in production: **`db.transaction()` throws.** Every mutation is
  one statement. Where two rows must change together, use one statement with CTEs.
- The foundation commit added `attorney_reschedule_requests` with a partial unique index on
  `(assignment_id) WHERE status IN ('open','in_review')`, a nullable `assignment_id`
  (`ON DELETE SET NULL`), and a `snapshot jsonb`. Read the foundation report for exact
  Drizzle object names.
- W1B owns attorney authentication. As of Wave 1, `src/lib/auth.ts` exports
  `getAttorneyIdentity()` / `requireAttorney()` returning a validated
  `{ attorneyId, eventId }` with the server-side expiry check already applied. **Read the
  actual final exports in your worktree before coding.** Never re-derive attorney identity
  from a URL, form field, or cookie yourself.
- Adding UI must not widen authorization. Do not turn any role check into one that admits a
  new role implicitly.

## Requirements

### 1. Attorney portal shell and routes

W1B's `/attorney/login` and its callback **must stay outside any authenticated shell** —
wrapping them would break the login flow. So:

- Create the authenticated shell at `src/app/attorney/(portal)/layout.tsx` (a route group,
  so it does not apply to `login/` or the callback) covering `schedule/` and `requests/`.
  It calls `requireAttorney()` and renders a small nav plus sign-out.
- Add `src/app/attorney/page.tsx`: redirect to `/attorney/schedule` when a valid attorney
  session exists, otherwise to `/attorney/login`.

### 2. Attorney schedule

Show, for the bound `{ attorneyId, eventId }` only: date, day label, start/end time,
company name, format (virtual / in person) and location, meeting instructions or preferred
platform, and interviewer names where present.

- Project on the server. **Never send to the client**: other attorneys' or companies'
  identifiers, staff notes, `attorney_unavailability.note`, corporate contact details, or
  raw storage fields. Precheck finding 6 is binding: strip before serialization, not in the
  renderer. A hidden prop is not a privacy boundary.
- Only the session's event. Reject hand-edited event ids and attorney ids outright.
- The attorney may open **their own** resume; nobody else's, via an explicit `attorneyId`
  equality check against `getAttorneyIdentity()`. **The Wave 1 correction pass owns
  `src/app/api/attorneys/[id]/resume/route.ts` and is adding exactly that case — do not edit
  the route.** Read it, link to it, and test against it. If the own-attorney case is missing
  when you get there, report it in `blockers` rather than editing someone else's file.
- External resume references (`attorney_resume_references`) are shown as unverified links;
  the server never fetches them.
- Print-friendly: use Tailwind `print:` utilities as
  `src/app/portal/schedule/review/page.tsx` already does. **Do not edit
  `src/app/globals.css`** — W2C owns it.

### 3. Reschedule requests — attorney side

- The attorney submits a request against one of their own confirmed assignments, with a
  free-text `reason` (attendee-visible) and optional preferred alternative slots (advisory
  only).
- On submit, write `snapshot` with company name, day date, and slot times, so the history
  survives if the booking later disappears.
- **The `assignments` row is not modified.** Submitting a request changes nothing about the
  booking; company, staff, and printable views all still show it.
- Duplicates: the partial unique index means a second active request for the same
  assignment fails at the database. Catch that violation and show "you already have a
  request pending for this interview," with the existing request. Do not pre-check with a
  `SELECT` and treat it as authoritative.
- The attorney may `withdraw` their own open request. They may not set any other status.
- **A closed event does not block requests.** Last-minute changes are the approved use case;
  the open/closed flag governs *company selections*, not rescheduling. Do not add a closed
  check here.
- A withdrawn or missing enrollment does block: show a clear read-only notice and refuse
  submissions.

### 4. Staff queue and resolution

At `src/app/admin/events/[eventId]/requests/` (replaces the foundation placeholder),
admin-only:

- List requests for the event with status, attorney, the snapshot, the attorney's reason,
  and a **staff-only** note field. `staff_note` is never included in any attorney-facing
  payload.
- Statuses and the only permitted transitions:
  - `open → in_review | resolved_declined | resolved_rescheduled` (staff)
  - `in_review → resolved_declined | resolved_rescheduled | open` (staff)
  - `open | in_review → withdrawn` (owning attorney only)
  - `open | in_review → superseded` (set when the underlying assignment is deleted)
  - Resolved, withdrawn, and superseded are terminal.
  Put the machine in `src/lib/reschedule.ts` as a pure, tested transition guard, and call it
  on the server for every mutation. Enforce the actor too: no staff transition is reachable
  from an attorney session and vice versa.
- **Staff must be able to review and resolve even when the event is closed.**

### 5. Resolution must be atomic

"Resolve by rescheduling" moves the booking and closes the request. Splitting that into two
writes can leave a moved booking with an open request, or a resolved request with an
unmoved booking. Use **one statement**:

```sql
WITH moved AS (
  UPDATE assignments a
     SET time_slot_id = $newSlot, updated_at = now()
   WHERE a.id = $assignmentId
     AND a.status = 'confirmed'
     AND EXISTS (SELECT 1 FROM time_slots ts
                   JOIN event_days d ON d.id = ts.event_day_id
                  WHERE ts.id = $newSlot AND d.event_id = $eventId)
     AND NOT EXISTS (SELECT 1 FROM attorney_unavailability u
                      WHERE u.attorney_id = a.attorney_id
                        AND (u.time_slot_id = $newSlot
                             OR u.event_day_id = (SELECT event_day_id
                                                    FROM time_slots WHERE id = $newSlot)))
  RETURNING a.id
), resolved AS (
  UPDATE attorney_reschedule_requests r
     SET status = 'resolved_rescheduled',
         resolution_assignment_id = (SELECT id FROM moved),
         resolved_by = $staff, resolved_at = now(), updated_at = now()
   WHERE r.id = $requestId
     AND r.status IN ('open','in_review')
     AND EXISTS (SELECT 1 FROM moved)
  RETURNING r.id
)
SELECT (SELECT count(*) FROM moved)    AS moved,
       (SELECT count(*) FROM resolved) AS resolved;
```

Both existing unique constraints (`assignments_attorney_slot_unique`,
`assignments_company_slot_unique`) stay authoritative. A violation aborts the whole
statement, so nothing changes — map it to a useful conflict message, never a 500. Adjust
the predicates to match what W1C actually shipped (read
`src/app/portal/schedule/` and W1C's slot-release decision in its report first) and reuse
its conflict-message mapping rather than writing a second one.

Declining resolves the request and changes no booking.

### 6. Superseded requests

If the underlying assignment is deleted, the FK sets `assignment_id` to null. Any active
request in that state must display as `superseded` with its snapshot intact — the history
must not vanish. Compute or persist this; do not cascade-delete request rows.

## Files you own

- `src/app/attorney/(portal)/layout.tsx`, `src/app/attorney/page.tsx`,
  `src/app/attorney/schedule/**`, `src/app/attorney/requests/**`
- `src/app/admin/events/[eventId]/requests/**` (replaces the foundation placeholder)
- `src/lib/reschedule.ts` (new)
- `src/app/admin/events/[eventId]/assignments/actions.ts` — **only** to add the staff
  resolve-by-moving action

## Files you must not touch

- `src/app/attorney/login/**` and the magic-link callback, `src/lib/auth.ts`,
  `src/lib/session.ts`, `src/proxy.ts`, `src/app/api/attorneys/[id]/resume/route.ts`,
  `src/lib/email/**` — W1B and the Wave 1 correction pass own these.
  **You never send mail.** Staff
  announce changes through W2C's notification feature; do not enqueue anything.
- `src/lib/db/schema.ts`, `drizzle/**`, `package.json`, `package-lock.json`,
  `src/lib/admin-nav.ts`, `src/lib/spreadsheet-safe.ts` — foundation owns
- `src/app/globals.css` — W2C owns
- `src/app/portal/**`, `src/lib/practice-areas.ts`,
  `src/app/admin/events/[eventId]/roster-import/**`, `.../notifications/**`,
  `src/components/attorney-picker.tsx` — W1/W2A/W2C
- Anything under `docs/campaign-hq/` except your own report, anything under `work/`

## Tests

`npm test` via the foundation runner. Test behaviour, not your own function shapes.

1. **Cross-attorney isolation.** Attorney A cannot see or act on B's interviews; hand-edited
   assignment, attorney, and event ids in forms and URLs all fail closed.
2. **Multi-event.** One address enrolled in a historical and a current event sees only the
   session's event.
3. **Booking survives a request.** Assert the `assignments` row is byte-identical after
   submission, and that the company and staff views still show it.
4. **Duplicate requests.** Ten concurrent submissions for one assignment → exactly one
   active row, nine useful messages, no 500.
5. **Transition guard.** Every disallowed move is refused server-side: `resolved_* → open`,
   `withdrawn → in_review`, attorney attempting `resolved_*`, staff attempting `withdrawn`.
6. **Staff-note isolation.** Put a sentinel in `staff_note` and a distinctive
   `attorney_unavailability.note` in the fixture; load every attorney-facing page and assert
   neither appears in rendered HTML **or** the RSC/network payload. Staff view still shows
   them.
7. **Atomic resolution.** A resolve into an already-taken slot leaves both the assignment
   and the request unchanged and returns a conflict. A successful resolve appears in the
   attorney, company, staff master, and printable views.
8. **Closed event.** With the event closed: company selections still blocked (W1C's rule
   unchanged), attorney requests still accepted, staff resolution still works.
9. **Withdrawn enrollment.** A withdrawn attorney gets the read-only notice and cannot
   submit.
10. **Superseded.** Delete the assignment behind an open request → the request survives with
    its snapshot and reads as superseded.
11. **Own resume only.** The attorney can open their own PDF; another attorney's id returns
    a controlled failure; a fabricated UUID does not throw.
12. **Print.** Attorney schedule prints without nav chrome on Letter; check the 375 px
    layout.

## Verification

From your worktree root:

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
COUNSEL_TEST_ENV_FILE=ENV_FILE npm test
```

All must pass. Do not weaken lint rules, add `eslint-disable`, use `@ts-ignore`, or loosen
`tsconfig`. `ENV_FILE` is the private 0600 config root gave you; never print its values.
**Do not connect to any production database. Do not send email. Do not run the seed or wipe
scripts.**

## Commit

```
codex/w2b-attorney-schedule: add attorney schedule and staff-reviewed rescheduling
```

## Final report

Emit JSON matching `docs/campaign-hq/schemas/worker-result.json`. In `blockers`, state:
the exact attorney-identity API you found; whether the resume route already handled the
attorney case or you added it; the final CTE you shipped and how you verified nothing writes
partially; and any acceptance case you could not exercise.
