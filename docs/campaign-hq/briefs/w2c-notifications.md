# Worker Brief: W2C — Notification preview/send, mail-merge export, print and nav completion

You are a Codex CLI implementation worker. Work only inside your worktree. Do not spawn
subagents. Finish with a commit.

A reviewer will adversarially test this. It is the only feature in the wave that can send
mail to real people.

## Goal

Staff build an announcement, see the exact recipients and the exact rendered message,
explicitly authorize it, and get per-recipient delivery results with bounded retries.
Staff also get a spreadsheet export that drives the existing Word mail merge. Finish the
wave's navigation and print surfaces.

Approved scope: `docs/campaign-hq/APPROVED-PLAN.md` §4.

## Base

- Branch: `codex/w2c-notifications`
- Worktree: `WORKTREE`
- Base commit: `BASE_COMMIT` (W2 foundation)

## Environment facts

- Next.js **16.1.6**, App Router, TypeScript strict, Drizzle ORM.
- `drizzle-orm/neon-http` in production: **`db.transaction()` throws.** Every mutation is
  one conditional statement.
- The foundation added `notification_batches` and `notification_recipients` (with
  `preview_revision`, `preview_hash`, `content_hash`, `provider_idempotency_key`),
  `src/lib/spreadsheet-safe.ts`, `xlsx@0.20.3`, `npm test`, and a placeholder at
  `src/app/admin/events/[eventId]/notifications/page.tsx` that you replace.
- W1B owns `src/lib/email/`: a transport interface, a real Resend implementation as the
  production default, and a local capture transport that must be impossible in production.
  **Read the actual exports before coding.** There is no email provider key configured yet;
  your job is correct, configuration-gated code, not credentials. Record required
  environment **key names** in your report, never values.
- **No second mail implementation.** You may minimally extend the transport's *types* and
  add idempotency-key plumbing if W1B's version lacks it — that extension is explicitly
  yours and must be called out in your report. Everything else in `src/lib/email/` stays as
  shipped, and the capture transport must remain impossible in production.

## Requirements

### 1. Audience is criteria, never a client list

Store the audience *criteria* on `notification_batches.audience` and recompute recipients on
the server. A client payload must never be able to name arbitrary addresses.

- Default audience: **active attorneys in the event with at least one confirmed
  assignment.**
- Staff may explicitly choose other audiences (for example attorneys with no assignment).
  Each choice must produce a visibly different preview with its own count — never a silent
  substitution.
- **Ambiguous emails are blocked, not merged.** If two different attorneys in the event
  share one normalized email, both recipient rows are written with status
  `blocked_ambiguous`, shown prominently in the preview, and never sent. This matches the
  Wave 1 authentication rule: an ambiguous address is not a person.
- The same attorney appearing twice in one batch is a `skipped_duplicate` — that is the only
  dedup case, and `unique (batch_id, attorney_id)` enforces it.

### 2. Preview is an immutable snapshot

Generating a preview increments `preview_revision`, writes one `notification_recipients` row
per recipient capturing `email`, `rendered_subject`, `rendered_body`, `content_hash`, and a
per-recipient `provider_idempotency_key`, and stores a `preview_hash` over the whole set.

- **Sending sends exactly those stored rows.** The sender never re-renders and never
  recomputes the audience.
- Authorization names the revision. If the batch, the event, the schedule, or the audience
  changed since that preview, the confirmation is invalid: mark the batch stale and require
  a fresh preview. Staff must never authorize one message and have a different one go out.
- Preview writes only the draft batch and its recipient snapshot. It sends nothing.

### 3. Authorization and sending

- Admin-only, everywhere, using the corrected staff-org helper from Wave 1 — read
  `src/lib/auth.ts` and use it rather than a local role check.
- Creating a batch, previewing, and authorizing are three distinct actions.
  `authorized_by` / `authorized_at` must be populated before the batch may enter `sending`.
  An unauthorized batch cannot transition, and an unauthorized send attempt is refused.
- The send action in the shipped app **is** staff authorization — the product must not
  require anyone outside the app to approve a send. (Separately, during this rollout no real
  recipient sends happen; that is a release-process rule, not something you encode as a
  permanent gate.)
- Claim each recipient with one statement so two concurrent runs cannot double-send:
  ```sql
  UPDATE notification_recipients
     SET status = 'sending', attempts = attempts + 1
   WHERE id = $id AND status IN ('pending','failed') AND attempts < 3
  RETURNING *
  ```
  Send only when exactly one row comes back.
- **Retry reuses the stored `provider_idempotency_key`.** After an uncertain or timed-out
  provider response, a retry with the same key is safe; generating a fresh key is how you
  double-send a real person. Never mint a new key on retry. Retryable failures stop at 3
  attempts; permanent failures are not retried at all.
- Results view: per-recipient status, attempts, provider message id, and last error, with a
  "retry failed only" action that never touches `sent` rows.

### 4. Mail-merge export

The existing staff workflow merges a Word document against the assignments workbook. Both
are tracked; the field names below were extracted from them, so the export must match
exactly or the merge silently binds nothing.

- Header row reproduces
  `data/04-assignments/04_Assignments - Counsel Connections 2025.xlsx` byte-for-byte:
  `First Name`, `Last Name`, `Daytime Number`, `eMail` (lower-case `e`), `Firm`,
  `Conflicts`, then repeating groups `DateN`, `TimeN`, `CompanyN`, `InterviewerN`,
  `CommentsN`. **`Comments1` has a trailing space in the source header** — Word derived the
  merge field `Comments1_` from it. Keep the trailing space.
- The merge document
  (`data/05-communications/05A_ Selected Email … (MERGE DOC).docx`) binds `First_Name`,
  `Last_Name`, and groups 1–8. Verify your header row against it before finishing.
- Value formats, matching the tracked data: `Tuesday, October 7` /
  `4:15 p.m. - 4:30 p.m.` / `Interviewer: Inya Baiye` / `Interviewers: A & B` /
  `Platform: Zoom`.
- **More than 8 interviews must never be silently dropped.** The 2025 file already goes to
  9. Emit groups up to the actual maximum in the data, keep groups 1–8 identical to the
  merge document, add an `Overflow_Count` column, and show staff a clear warning in the UI
  naming the affected attorneys.
- Escape every cell with `escapeForSpreadsheet` from `src/lib/spreadsheet-safe.ts`. A
  company named `=HYPERLINK("http://evil","x")` must export as literal text.
- Admin-only, event-scoped, `Cache-Control: private, no-store`.

### 5. Print and navigation completion

- `src/app/globals.css` is yours and the wave's only `@media print` owner. Add shared print
  rules; W2A and W2B use Tailwind `print:` utilities and do not touch this file.
- Make the staff master schedule printable and readable on Letter.
- Confirm every Wave 2 route is reachable from navigation. **An unreachable route does not
  count as done.** The foundation added the admin entries; verify them against what actually
  shipped and report anything missing rather than editing `src/lib/admin-nav.ts` yourself.

## Files you own

- `src/app/admin/events/[eventId]/notifications/**` (replaces the foundation placeholder)
- `src/lib/notifications/**` (new)
- `src/lib/email/templates/**` (new subdirectory only)
- `src/lib/email/` transport **types and idempotency plumbing only**, if genuinely absent
- `src/app/api/admin/export/schedule/route.ts` (new)
- `src/app/globals.css`
- Print markup on the staff master schedule view

## Files you must not touch

- The Resend implementation and capture transport bodies in `src/lib/email/` beyond the
  narrow extension above
- `src/lib/auth.ts`, `src/lib/session.ts`, `src/app/attorney/**` — W1B/W2B
- `src/lib/db/schema.ts`, `drizzle/**`, `package.json`, `package-lock.json`,
  `src/lib/spreadsheet-safe.ts`, `src/lib/admin-nav.ts` — foundation owns
- `src/app/admin/events/[eventId]/roster-import/**`, `.../requests/**`,
  `.../assignments/actions.ts`, `src/lib/practice-areas.ts`, `src/components/attorney-picker.tsx`,
  `src/app/portal/**` — W2A/W2B/W1
- Anything under `docs/campaign-hq/` except your own report, anything under `work/`

## Tests

`npm test` via the foundation runner. Test behaviour and delivery outcomes, not your own
function shapes. Use synthetic names and addresses in any new committed fixture.

1. **No real sends, ever.** Assert the capture transport is the active one in tests, and
   fail the run if the Resend path is reached. Assert the capture transport refuses to
   operate when `NODE_ENV === "production"`.
2. **Preview equals send.** Send delivers the stored `rendered_subject` / `rendered_body`
   verbatim; mutate an attorney's schedule after preview and confirm the *stored* content is
   what would go out, and that the batch is flagged stale rather than silently re-rendered.
3. **Stale confirmation.** Authorize revision 1, then re-preview to revision 2 → the
   revision-1 authorization is refused.
4. **Authorization.** A non-admin cannot create, preview, authorize, or send. An
   unauthorized batch cannot enter `sending`.
5. **Ambiguous emails.** Two attorneys in one event sharing an address → both
   `blocked_ambiguous`, zero sends, visible in the preview.
6. **Duplicate attorney.** The same attorney twice in one batch → one send, one
   `skipped_duplicate`.
7. **Retry keeps the key.** Force a retryable failure, retry, and assert the same
   `provider_idempotency_key` is presented and no `sent` row is touched. After 3 attempts
   the row stops being claimed. A permanent failure is not retried.
8. **Concurrency.** Two simultaneous send runs over one batch deliver each recipient exactly
   once.
9. **Export fidelity.** The header row matches the assignments workbook exactly, including
   `eMail` and the trailing space in `"Comments1 "`, and every field the merge document
   binds is present.
10. **Overflow.** An attorney with 9 interviews exports all 9 with `Overflow_Count` set and
    a warning surfaced — nothing dropped.
11. **Formula injection.** Company `=HYPERLINK(…)` and interviewer `+1+1` export with a
    leading apostrophe and reopen as literal text.
12. **Print/nav.** Master schedule prints readably; every Wave 2 route is reachable from
    navigation.

## Verification

From your worktree root:

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
COUNSEL_TEST_ENV_FILE=ENV_FILE npm test
```

All must pass. Do not weaken lint rules, add `eslint-disable`, use `@ts-ignore`, or loosen
`tsconfig`. `ENV_FILE` is the private 0600 config root gave you; never print its values.
**Do not connect to any production database. Do not send real email to anyone. Do not run
the seed or wipe scripts.**

## Commit

```
codex/w2c-notifications: add previewed notifications, mail-merge export, print completion
```

## Final report

Emit JSON matching `docs/campaign-hq/schemas/worker-result.json`. In `blockers`, list:
required environment **key names** (never values); the exact transport API you found and
precisely what, if anything, you extended; the maximum interview-group count your export
emits; and anything you could not verify without a provider account.
