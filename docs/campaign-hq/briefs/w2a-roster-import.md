# Worker Brief: W2A — Roster import (preview, map, validate, dedup, apply)

You are a Codex CLI implementation worker. Work only inside your worktree. Do not spawn
subagents. Finish with a commit.

A reviewer will adversarially test this. The importer writes to the attorney table that the
whole event depends on.

## Goal

Staff upload the registration roster workbook and get: a column mapping step, an explicit
percentage-format confirmation, a server-validated preview with per-attorney issues, a
correction pass for missing emails and ambiguous identities, and an explicit apply that
never touches scheduling or resume data. Re-running the same import changes nothing.

Approved scope: `docs/campaign-hq/APPROVED-PLAN.md` §2.

## Base

- Branch: `codex/w2a-roster-import`
- Worktree: `WORKTREE`
- Base commit: `BASE_COMMIT` (W2 foundation)

## Environment facts

- Next.js **16.1.6**, App Router, TypeScript strict, Drizzle ORM.
- `drizzle-orm/neon-http` in production: **`db.transaction()` throws.** Every write is one
  conditional statement. There is no "roll back the import" — design so partial application
  is *recorded*, per candidate, rather than prevented by a transaction.
- The foundation commit already added: the three `roster_import*` tables,
  `attorney_resume_references`, `src/lib/spreadsheet-safe.ts`, `xlsx@0.20.3`, `npm test`,
  and a placeholder page at `src/app/admin/events/[eventId]/roster-import/page.tsx` that
  you replace. Read the foundation's report for exact exported names before coding.

## What the real data actually looks like

Verified against the tracked workbooks — do not re-derive, but do re-check if the files
changed:

- `data/03-availability-selection/03C_… .xlsx`, single sheet, header row
  `Practice Area | Percent of Practice | First Name | Last Name | Firm | City |
  Organization Type | # Partners | # Associates | # Of Counsel`. 217 data rows → **130
  attorneys**, one row per practice area. **There is no email column and no resume column.**
- Percentages are numeric `0.05`–`1.0` with Excel number format `0%`. `0.5` means 50%.
- 44 attorneys have one area, 85 have two, **1 has three**
  (Adam Sloustcher, Fisher Phillips LLP) — and that record lists `Labor & Employment Law`
  twice, 0.5 and 1, summing to 2.0. This is the canonical "flag, never auto-fix" case.
- `data/04-assignments/04_… .xlsx` **does** have an `eMail` column. Joining on normalized
  `first|last|firm` resolves **120 of 130** with zero email conflicts. **10 attorneys have
  no email anywhere in the tracked data.**
- `scripts/seed.ts` around line 388 fabricates
  `firstname.lastname@placeholder.com` when that join misses. **Never do this.** A
  fabricated address becomes a magic-link identity nobody controls. Do not copy the seed's
  logic; read it only to understand the data.

## Requirements

### 1. One validator, two callers

Preview and apply must call the **same exported function**, not equivalent logic. The apply
request carries no attorney data — only `importId`, an array of
`{ candidateId, decision }` with decision ∈ `create | update | skip`, and optional
`{ candidateId, correctedEmail }`. The server re-reads `roster_import_rows.raw`, re-runs the
validator, and refuses any candidate whose recomputed result differs from the previewed one
(stale-preview guard). A client payload must never be able to authorize a write the server
would not have computed on its own.

Everything is admin-only, scoped to the `eventId` in the route and re-derived from the
verified session — never from a form field.

### 2. Untrusted input

Use `src/lib/spreadsheet-safe.ts` for every cell read. Enforce its byte and row caps, an
extension/content-type allowlist (`.xlsx`, `.csv`), and reject anything else before
parsing. Never evaluate a formula, never follow a cell hyperlink, never fetch anything.
Store the raw row in `roster_import_rows.raw` as text you have already sanitized.

### 3. Percentages

- The mapping step asks staff to confirm `percentFormat: 'fraction' | 'whole'`. Pre-select
  from the cell number format (`XLSX.readFile(path, { cellNF: true })`, format `0%` ⇒
  fraction) and the observed value range, and show a worked example — "0.5 in row 3 will be
  stored as 50%" — before apply. Never guess silently. Store the choice on
  `roster_imports.percent_format`.
- **Use W1A's `src/lib/practice-areas.ts`. Do not write a second parser or serializer.**
  As of Wave 1 it exports
  `parsePracticeAreas(value, { percentageFormat: 'auto' | 'fraction' | 'whole' })`
  returning entries plus flags, and `serializePracticeAreas(entries)`. **Read the actual
  final exports in your worktree before coding; the signature may have been corrected.**
  Pass the staff-confirmed format explicitly — never `'auto'` — for imported values.
- The Wave 1 correction pass adds an explicit whole-scale marker to newly serialized
  entries (`percentScale: 'whole'` or equivalent metadata), so a newly stored `1` is not
  later read back as the legacy fraction `100%`. Unmarked legacy entries keep their current
  meaning: `0.5/0.5` is 50/50, `1` is 100. Use that marker on every entry you write. If the
  integrated module has no way to express it, **stop and report it in `blockers`.** Do not
  invent a private convention and do not fork the module.
- Absent percentages stay absent and mark the record incomplete. Never default to 100.
- Duplicate areas within one candidate: keep both, flag `duplicate_area`. Do not sum, merge,
  or drop. Sums outside 100 flag `percent_sum_out_of_range`; more than two areas flags
  `over_two_areas`. All three are applicable, visible warnings — not blocks.
- Legacy labels (`Immigration Law`, `Majority-owned law firm`, …) are preserved verbatim
  per `docs/campaign-hq/reference/taxonomy.md`. Match canonical case-insensitively for
  display; never rewrite stored values.

### 4. Identity, dedup, missing emails

Resolution order, first match wins, recorded in `match_method`:
1. `event_email` — normalized email equals an existing `attorneys.email` in this event.
   Authoritative.
2. `name_firm` — normalized `first|last|firm` matches exactly one active attorney in this
   event. Advisory: shown as a *proposed* match staff must accept.
3. `manual` — staff picked the target in the preview.
4. `none` — create.

Emails come from a mapped file column when present, otherwise from an optional **companion
workbook upload** joined on normalized `first|last|firm`. The join is offered in the UI; it
is not automatic and not hardcoded to a repository path.

- A candidate with no resolvable, syntactically valid email gets `resolution = 'needs_email'`
  and **cannot be applied**. It stays in the staging table on a correction queue where staff
  can supply an address. `attorneys.email` is `NOT NULL` with `unique(event_id, email)`, so
  there is no "create now, fix later" — and a placeholder would be worse than a gap.
- Two candidates resolving to one attorney, or one candidate matching two attorneys, sets
  `resolution = 'ambiguous'`, blocks **that candidate only**, and never picks arbitrarily.
  The rest of the import still applies.
- Normalize consistently with however W1B normalizes attorney login emails (trim, casefold);
  read `src/lib/auth.ts` and match it, so an imported identity and a login identity cannot
  disagree.

### 5. Apply — single statements, closed allowlist

- create: `INSERT INTO attorneys (…) VALUES (…) ON CONFLICT (event_id, email) DO NOTHING
  RETURNING id`. Zero rows back means someone created it in between → record
  `applied_action='raced'`, do not overwrite.
- update: `UPDATE attorneys SET … WHERE id = :matchId AND event_id = :eventId RETURNING id`.
  Zero rows back is an error, not a silent success.
- **The update column allowlist is closed**: first/last name, firm, city,
  organization_type, practice_areas, partner/associate/of_counsel counts, updated_at.
  It must never include `status`, `email`, `resume_path`, `resume_original_name`,
  `resume_size`, `resume_uploaded_at`, `is_unavailable`, or `unavailable_note`. Assignments,
  unavailability, and resumes are therefore preserved by construction, not by care.
- Write the per-candidate outcome (`applied_action`, `applied_attorney_id`, `applied_error`,
  `applied_at`) as you go, then set `roster_imports.status='applied'`. A failure partway
  through leaves an accurate, resumable record — that is the substitute for a transaction.

### 6. Resume references

The workbook has no resume column today; the corrected registration export is expected to
carry URLs. Support a mappable resume-reference column that writes
`attorney_resume_references` rows.

- `isSafeExternalUrl` gates every stored URL: `https:` only, no credentials, no IP-literal
  or loopback/link-local hosts. Anything else is rejected with a visible issue.
- **The server never fetches these URLs.** No HEAD, no reachability probe, no preview.
  Render as links with `rel="noopener noreferrer"` and a clear "unverified external
  reference" label. Your tests must stub `fetch` and fail if it is called during import.
- Report attorneys whose reference is missing or rejected; do not fabricate one.

### 7. Making references visible where resumes are used

An import audit table is not enough — the people who need the reference are staff reviewing
an attorney and companies choosing one.

- Admin: show an attorney's references read-only in the attorney manage dialog.
- Company: in the company-facing attorney view, when there is **no uploaded PDF**, show the
  external reference link instead, so selection is not blind.

This is display only. **Do not change W1C's company-safe projection rules, booking logic,
or privacy filtering.** Add the reference list to the server projection explicitly and
prove, with a test, that no other private field rides along — no unavailability `note`, no
staff note, no other company's identifiers. Read
`work/reviews/auth-scheduling-precheck.md` finding 6 before touching that projection.

## Files you own

- `src/app/admin/events/[eventId]/roster-import/**` (replaces the foundation placeholder)
- `src/lib/roster-import/**` (new)
- `src/components/attorney-picker.tsx` and the company schedule projection —
  **resume-reference display only**
- `src/app/admin/events/[eventId]/attorneys/attorney-manage-dialog.tsx` —
  **resume-reference display only**

## Files you must not touch

- `src/lib/db/schema.ts`, `drizzle/**`, `package.json`, `package-lock.json`,
  `src/lib/spreadsheet-safe.ts`, `src/lib/admin-nav.ts` — foundation owns these; if you
  need a column or helper, stop and report a blocker
- `src/lib/practice-areas.ts` and `src/app/portal/schedule/practice-display.ts` — the Wave 1
  correction pass owns both; import them, never edit them, never copy their normalization
- `src/lib/auth.ts`, `src/lib/session.ts`, `src/lib/email/**`, `src/app/attorney/**` — W1B/W2B
- `src/app/admin/events/[eventId]/requests/**`, `.../notifications/**`,
  `src/app/admin/events/[eventId]/assignments/actions.ts` — W2B/W2C
- `scripts/seed.ts`, `scripts/wipe.ts`, `src/app/globals.css`
- Anything under `docs/campaign-hq/` except your own report, anything under `work/`

## Tests

`npm test`, Node's `node:test` via the foundation's runner. Test behaviour and data
outcomes, not the shape of your own functions — no test that merely restates an
implementation detail.

Use the tracked workbooks directly for real-data cases. For new committed fixtures use
**synthetic names**; do not copy real participant names or addresses into new files.

1. **Percentages.** Real roster slice with `percentFormat='fraction'`: `0.5/0.5` stores as
   50/50 and `1` stores as 100; nothing renders as `0.5%`. A synthetic `50/50` with
   `percentFormat='whole'` produces the identical stored result. A pre-existing legacy
   record still displays 100% and is not rewritten.
2. **Sloustcher record** (from the tracked file): flags `over_two_areas`, `duplicate_area`,
   `percent_sum_out_of_range`; applies with all three areas intact; nothing summed or
   dropped.
3. **Missing emails.** The 10 unjoinable attorneys become `needs_email`; apply creates zero
   rows for them; assert the string `placeholder.com` appears nowhere in the resulting data.
   Supplying an address through the correction path then creates exactly one.
4. **Idempotency.** Apply twice. Second run: 0 created, all `unchanged`. Assert directly
   that `assignments`, `attorney_unavailability`, and the four `resume_*` columns are
   identical before and after.
5. **Preservation under real change.** Give an imported attorney an assignment, a resume
   path, and `status='withdrawn'`, then re-import with a changed city. City changes; the
   other three do not.
6. **Ambiguity.** A synthetic file with one identity duplicated under two firms: both
   flagged, neither applied, remaining candidates apply normally.
7. **Forged apply.** A `candidateId` from another event's import; a `create` decision on a
   `needs_email` candidate; a corrected email that fails validation. All three refused, no
   rows written.
8. **Stale preview.** Change the underlying attorney between preview and apply → reported
   as a conflict, not an overwrite.
9. **Hostile cells and URLs.** Formula, `javascript:` link, credentialed URL,
   `169.254.169.254`, and an oversized cell: inert, rejected, and `fetch` never called.
10. **Company projection.** With a distinctive unavailability note and another company's
    assignment in the fixture, load the company attorney view and assert neither sentinel
    appears in the serialized payload, while the resume reference does.

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
codex/w2a-roster-import: add previewed roster import with safe resume references
```

## Final report

Emit JSON matching `docs/campaign-hq/schemas/worker-result.json`. In `blockers`, state:
the exact `practice-areas.ts` API you found and whether it can express an explicit
whole-scale write; any acceptance case you could not exercise; and any place you needed a
column the foundation did not provide.

## Root cell-format precision
Keep raw numeric cell.v and its number-format metadata alongside display text when staging spreadsheet rows. The shared readCellText helper prefers cell.w, so it may return '50%' for numeric0.5; never multiply that formatted string again merely because the mapping scale is fraction. Numeric0.5 with 0% format ->50, text'50%' ->50, unformatted numeric50 with whole mapping ->50. Preview examples and apply must prove these actual cases with the tracked workbook. Import/export parser helpers are server modules (spreadsheet-safe imports node:net); do not import that module from a client component.

## Root upload transport check
A 5 MB XLSX cannot silently depend on Next's default Server Action request-body limit. Inspect Next16 behavior and use a guarded admin route handler or explicit configured server-action limit as appropriate. Keep both route and action authorization/event scope server-side. Acceptance must actually upload a workbook larger than1MB but below5MB and reject one above5MB with a useful preview error; do not only unit-test a constant.
