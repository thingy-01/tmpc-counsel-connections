# Worker Brief: W1C - Company scheduling and resume access scoping

You are a Codex CLI implementation worker. Work only inside your worktree. Do not spawn
subagents. Finish with a commit.

This is a security-critical task. A reviewer will adversarially test it.

## Required reading before you edit

`work/reviews/auth-scheduling-precheck.md`, findings **1**, **2**, **3**, and **6**. They
are binding requirements. Their "Acceptance" paragraphs describe how this work will be
tested.

## Environment facts

- Next.js **16.1.6**, App Router.
- `src/lib/db/index.ts` selects `drizzle-orm/neon-http` for Neon URLs and node-postgres
  otherwise, hiding the difference behind a type cast. **`db.transaction()` throws
  `No transactions support in neon-http driver` in production.** Any earlier brief text
  showing `db.transaction()` was wrong; ignore it.
- `src/lib/db/schema.ts` already has both authoritative unique constraints:
  `assignments_attorney_slot_unique` and `assignments_company_slot_unique`.
- Do not modify `src/lib/db/schema.ts`; W1B owns it. Work against the existing schema.

## Goal

### 1. Atomic booking that works on the production driver

- Keep both unique constraints authoritative. Map their violations to useful conflict
  messages. A `SELECT` precheck is a courtesy, never the authority.
- Express each mutation as **one** conditional statement whose predicates carry ownership,
  event, lifecycle, and availability conditions. Do not replace a transaction with
  separate check / delete / insert calls; that loses bookings when the re-insert conflicts.
- Changing an assignment must be an atomic update that leaves the original booking intact
  on conflict.
- Removal must genuinely free the slot. Setting `status='cancelled'` alone does not
  release either unconditional unique constraint — account for this explicitly and say
  what you chose in your report.
- Two companies racing for one attorney/slot: exactly one wins, the other gets a useful
  conflict, neither gets a 500.

### 2. Scope every submitted identifier

- Resolve company and event from the authenticated company row, never from form input.
- Validate UUID shape without relying on casts.
- Join the submitted slot through its day to that event. Require the attorney to be in the
  same event and not withdrawn. Require any interviewer to belong to the current company.
- Update and delete must include assignment ownership **in the SQL predicate** and must
  error when no owned row changed.
- Enforce the open-event rule across booking, change, removal, **and the existing
  single/bulk interviewer controls** in `src/app/portal/interviewers/actions.ts`, which
  currently do not check scheduling state.
- Never expose an admin action to perform a company mutation.

### 3. Resume access (you own this route)

`src/app/api/attorneys/[id]/resume/route.ts` currently accepts any non-null `getRole()`
and then fetches by attorney id alone, so a signed-in company can read another event's
resume. W1B is adding an attorney role, which would inherit this hole.

- Use an explicit role allowlist so a newly added role gains nothing implicitly.
- Admin keeps staff access.
- A company may read resumes of selectable attorneys **in its own event**, including
  attorneys it has not booked — resume review happens during selection.
- Decide and document retained access for withdrawn attorneys already on that company's
  schedule.
- Derive scope from the verified session; never from a query-string event id.
- Keep responses private/no-store. A fabricated UUID or missing file returns a controlled
  response, not an exception.

### 4. Company-safe projection

- Build an explicit server projection for company views. Return only public attorney
  fields, a generic "unavailable" indicator, and the current company's own assignments.
- Strip unavailability **reasons**, staff notes, other companies' names and identifiers,
  and unnecessary raw storage fields **before** props reach any client component or action
  response. A hidden tooltip or unused prop is not a privacy boundary.
- `src/components/attorney-picker.tsx` currently carries `note` in its
  `UnavailabilityBlock` type and renders it. Keep the richer staff projection separate
  from the company one.

### 5. Selection experience

- Companies browse and filter interviewees, pick an available slot and attorney, assign
  their interviewer, and change or remove selections while the event is open.
- Show attorney name, firm, city, organization type, practice areas with percentages, and
  an authorized resume link.
- Include preferred virtual platform / meeting notes, reusing the existing company
  preference where appropriate.
- The selection experience must be **linked from the company schedule and navigation** and
  support the approved time-grid workflow. An unreachable route does not count as done.
- Successful edits must appear in the company schedule, the staff master schedule, and the
  printable view.
- Governed by the event's open/closed status. Do not hardcode any calendar date.

Practice-area display: W1A is creating `src/lib/practice-areas.ts` in a parallel branch.
Do not create your own copy and do not import it. Render whatever is stored defensively,
handling both `string[]` and `{area, percent}[]`, in a small local helper. The conductor
will reconcile the two at integration.

## Branch, worktree, base

- Branch: `codex/w1c-scheduling` (already checked out)
- Worktree: `/Users/thingy/Documents/Codex/2026-09-03/github-plugin-github-openai-curated-remote/work/trees/w1c-scheduling`
- Base commit: `461d305545aece601423da55c63898e5b44c834d`

## Files you own

- `src/app/portal/schedule/**`
- `src/app/portal/interviewers/actions.ts` (open-event enforcement only)
- `src/app/admin/events/[eventId]/assignments/**` (revalidation only)
- `src/app/api/attorneys/[id]/resume/route.ts`
- `src/components/attorney-picker.tsx`

## Files you must not touch

- `src/lib/db/schema.ts`, `src/lib/auth.ts`, `src/lib/session.ts`, `src/lib/email/**`,
  `src/app/attorney/**`, `drizzle/**` — W1B owns
- `src/app/admin/events/[eventId]/attorneys/**`, `src/lib/practice-areas.ts`,
  `src/app/portal/actions.ts`, `src/app/portal/page.tsx`, `src/app/login/page.tsx` — W1A owns
- Anything under `docs/campaign-hq/` except your own report

## Verification

From your worktree root:

```bash
npm run lint && npx tsc --noEmit
```

Both must pass. Do not weaken lint rules, add `eslint-disable`, use `@ts-ignore`, or
loosen `tsconfig` to make them pass. Do not connect to any production database.

## Commit

```
codex/w1c-scheduling: add company attorney booking workflow
```

## Final report

Emit JSON matching the supplied output schema. In `blockers`, state your slot-release
design decision and any acceptance scenario you could not exercise.

## Root production compatibility correction (must read)
The actual production DB adapter is drizzle-orm/neon-http, whose transaction() method is not supported. Do not copy the generic transaction example above blindly. Use a production-compatible atomic SQL design or coordinate a deliberate adapter change with the conductor; test concurrency against the same semantics. Server validation must include company/event/attorney/time-slot alignment and prevent forged IDs. The app uses Next.js 16.1.6. The final selection experience must be linked from the company schedule/navigation and support the approved time-grid workflow, not an unreachable route.
