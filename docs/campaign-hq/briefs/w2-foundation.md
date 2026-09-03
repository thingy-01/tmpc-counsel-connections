# Worker Brief: W2-F0 — Wave 2 foundation (schema, migration, xlsx, test harness, nav)

You are a Codex CLI implementation worker. Work only inside your worktree. Do not spawn
subagents. Finish with a commit.

**This commit must land and be reviewed before W2A, W2B, and W2C branch from it.** Those
three writers will be told the schema is frozen. If you get a table wrong, three parallel
writers inherit it.

## Why this task exists

Four surfaces are needed by all three Wave 2 writers: the database schema, the migration
file, `package.json`, and the admin navigation. Landing them once removes every merge
conflict in the wave. You build shared ground only — no feature routes, no feature UI, no
server actions.

## Environment facts

- Next.js **16.1.6**, App Router, React 19, TypeScript strict, Drizzle ORM.
- Production adapter is `drizzle-orm/neon-http`: **`db.transaction()` throws.** Every
  atomic operation elsewhere in this wave is a single statement. You are not writing
  queries, but your constraints are what make that possible — get them right.
- Production has **no migration ledger**. The SQL file you write *is* the record.
- Production is currently 1 event, 2 attorneys, 5 companies, 2 assignments, 1 resume path.
  Additive changes only.
- Production builds on **Node 22** (Railpack). Local dev may be newer. Anything you add to
  `package.json` must work on both.

## Base

- Branch: `codex/w2-foundation`
- Worktree: `WORKTREE`
- Base commit: `BASE_COMMIT` (W1A + W1B integrated; root separately integrates W1C, whose files do not overlap your ownership)

## 1. Schema — seven new tables

Append to `src/lib/db/schema.ts`. **Do not modify any existing table definition.** Also
write the equivalent SQL to `drizzle/0001_wave2_additive.sql` (adjust the number if
`drizzle/` already has files from W1B): `CREATE TABLE` and `CREATE UNIQUE INDEX` only, no
`ALTER COLUMN`, no `DROP`, no data migration.

All `id` columns are `uuid primary key default gen_random_uuid()`. All timestamps are
`timestamptz`. Status columns are `text` with the app owning the value set; do not add
Postgres enums (they are not additive-friendly).

### `roster_imports`
`event_id → events.id on delete cascade, not null`; `uploaded_by text not null`;
`original_filename text not null`; `sheet_name text`; `file_sha256 text not null`;
`column_mapping jsonb not null default '{}'`;
`percent_format text not null default 'unspecified'` — `fraction | whole | unspecified`;
`status text not null default 'draft'` — `draft | previewed | applied | discarded`;
`source_row_count integer not null default 0`; `created_at default now()`; `applied_at`.
Index `roster_imports_event_created_idx (event_id, created_at desc)`.

### `roster_import_rows` — verbatim source lines, the audit trail
`import_id → roster_imports.id on delete cascade, not null`; `row_number integer not null`;
`raw jsonb not null`; `candidate_id → roster_import_candidates.id on delete set null`;
`created_at default now()`.
`unique (import_id, row_number)`.

### `roster_import_candidates` — grouped attorney identities, what the preview lists
`import_id → roster_imports.id on delete cascade, not null`;
`identity_key text not null` (normalized `first|last|firm`);
`parsed jsonb not null`; `joined_email text`;
`email_source text not null default 'none'` — `file | companion_join | manual | none`;
`resolved_email text`; `match_attorney_id → attorneys.id on delete set null`;
`match_method text not null default 'none'` — `event_email | name_firm | manual | none`;
`resolution text not null default 'pending'` —
`pending | create | update | skip | needs_email | ambiguous | error`;
`issues jsonb not null default '[]'`;
`applied_action text` — `created | updated | unchanged | skipped | raced | failed`;
`applied_attorney_id → attorneys.id on delete set null`; `applied_error text`; `applied_at`.
`unique (import_id, identity_key)`.

### `attorney_resume_references` — external references, never fetched by the server
`attorney_id → attorneys.id on delete cascade, not null`; `url text not null`;
`label text`; `source text not null` — `import | manual`;
`import_id → roster_imports.id on delete set null`; `added_by text`;
`status text not null default 'unverified'` — `unverified | reported_broken | superseded`;
`created_at default now()`.
`unique (attorney_id, url)`.

### `attorney_reschedule_requests`
`assignment_id → assignments.id **on delete set null**, nullable`;
`attorney_id → attorneys.id on delete cascade, not null`;
`event_id → events.id on delete cascade, not null`;
`reason text` — **attorney-authored, attendee-visible**;
`preferred_alternatives jsonb not null default '[]'`;
`status text not null default 'open'` —
`open | in_review | resolved_rescheduled | resolved_declined | withdrawn | superseded`;
`staff_note text` — **staff-only, never sent to an attorney client**;
`snapshot jsonb not null default '{}'` — company name, day date, slot start/end at request
time, so history survives the booking;
`resolution_assignment_id → assignments.id on delete set null`;
`resolved_by text`; `resolved_at`; `created_at default now()`; `updated_at default now()`.

**`assignment_id` is nullable and `SET NULL` on purpose.** If a company deletes a booking,
the request history must survive with its snapshot and become `superseded`; it must never
be cascade-deleted.

Duplicate defence — a partial unique index, the only version that survives concurrency
without a transaction:
```sql
CREATE UNIQUE INDEX attorney_reschedule_requests_active_unique
  ON attorney_reschedule_requests (assignment_id)
  WHERE status IN ('open', 'in_review') AND assignment_id IS NOT NULL;
```
Also index `(event_id, status, created_at)` for the staff queue.
In Drizzle express this with `uniqueIndex(...).on(...).where(sql\`...\`)`; if your Drizzle
version cannot express the partial predicate, **the SQL file is authoritative** — write the
index there and note the divergence in your report rather than dropping the predicate.

### `notification_batches`
`event_id → events.id on delete cascade, not null`;
`kind text not null default 'schedule_announcement'` — `schedule_announcement | custom`;
`subject text not null`; `body_template text not null`;
`audience jsonb not null default '{}'` — the *criteria*, so recipients are recomputed
server-side and never accepted from a client;
`status text not null default 'draft'` —
`draft | previewed | sending | sent | partially_failed | cancelled`;
`preview_revision integer not null default 0`; `preview_hash text`; `previewed_at`;
`created_by text not null`; `authorized_by text`; `authorized_at`;
`created_at default now()`; `completed_at`.

### `notification_recipients` — the immutable preview snapshot
`batch_id → notification_batches.id on delete cascade, not null`;
`attorney_id → attorneys.id on delete cascade, not null`;
`email text not null` (normalized at preview time);
`preview_revision integer not null`;
`rendered_subject text not null`; `rendered_body text not null`;
`content_hash text not null`;
`provider_idempotency_key text not null`;
`status text not null default 'pending'` —
`pending | sending | sent | failed | skipped_duplicate | blocked_ambiguous`;
`attempts integer not null default 0`; `last_error text`; `provider_message_id text`;
`sent_at`; `created_at default now()`.
`unique (batch_id, attorney_id)`; `unique (provider_idempotency_key)`;
index `(batch_id, status)`.

Note for your own understanding, not for you to implement: two different attorneys sharing
one normalized email in one event are **blocked**, not merged — so there is deliberately no
unique index on `(batch_id, email)`. Both rows must be storable so both can be shown as
`blocked_ambiguous`.

## 2. Upgrade `xlsx` to 0.20.3 from the official SheetJS CDN

`xlsx@0.18.5` on npm has known prototype-pollution and ReDoS advisories, and Wave 2 makes
it parse staff-uploaded workbooks for the first time. npm is frozen at 0.18.5; the fix
ships only from SheetJS. Root verified the official instructions at
`https://docs.sheetjs.com/docs/getting-started/installation/nodejs/`.

```bash
npm install --save-exact https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Then:
- Commit the updated `package.json` **and `package-lock.json`**; confirm the lock records
  the resolved CDN URL and an `integrity` hash. A lock entry without integrity is a
  blocker, not something to work around.
- Verify at runtime: `node -e "console.log(require('xlsx').version)"` prints `0.20.3`.
- Re-verify the only existing consumer still parses the tracked workbook:
  `node work/release-preflight/run-local.cjs npx tsx --eval "…"` reading
  `data/03-availability-selection/03C_*.xlsx` and printing its row count (expect 218
  including the header). Do not run the seed against any database.
- **If the CDN is unreachable, stop and report the actual error text in `blockers`.**
  Do not silently stay on 0.18.5, and do not substitute an unrelated package.

## 3. Test harness

There is no test runner today. Use the already-present `tsx` devDependency and Node's
built-in `node:test`. Add no test framework.

Directory arguments and shell globs are unreliable for `.ts` test discovery across Node
versions; passing explicit file paths is reliable. Add `scripts/run-tests.mjs` that:
1. Refuses to run when `NODE_ENV === "production"`.
2. If `COUNSEL_TEST_ENV_FILE` is set, loads that absolute path with `dotenv`
   (`override: true`, `quiet: true`). Never print a value from it.
3. If `DATABASE_URL` is set, refuses unless its hostname is `127.0.0.1` or `localhost`.
   This guard is the reason a stray production URL cannot be reached from tests.
4. Recursively walks `src/` for `*.test.ts`, sorts the list, and spawns
   `node --import tsx --test <explicit files…>` with `stdio: "inherit"`, exiting with the
   child's status. Exit non-zero with a clear message when no test files are found.

`package.json` scripts: `"test": "node scripts/run-tests.mjs"`.

Add one trivial passing test (e.g. `src/lib/spreadsheet-safe.test.ts` from §4) so `npm test`
is green on your commit.

## 4. `src/lib/spreadsheet-safe.ts`

Both the importer (W2A) and the export (W2C) need the same untrusted-cell rules, in
opposite directions. You own it so neither writer depends on an uncommitted sibling.

Export exactly these, with short doc comments:
- `readCellText(cell: unknown, opts?: { maxLength?: number }): string` — returns the
  formatted/typed value as text. **Never reads `.f` (formula) or treats `.l` (link) as a
  navigable target.** Strips ASCII control characters except tab, trims, collapses internal
  whitespace runs, and truncates at `maxLength` (default 512).
- `escapeForSpreadsheet(value: string): string` — prefixes `'` when the value starts with
  `=`, `+`, `-`, `@`, tab, CR, or LF. This is the CSV/XLSX formula-injection guard.
- `isSafeExternalUrl(raw: string): boolean` — true only for `https:` URLs with a plain DNS
  hostname; false for any other scheme, for embedded credentials, for IP-literal hosts, and
  for link-local/loopback/private hosts. **Nothing in this module ever performs a network
  request.**
- `MAX_UPLOAD_BYTES = 5 * 1024 * 1024` and `MAX_UPLOAD_ROWS = 5000`.

Cover each of these with focused tests, including `=cmd|' /c calc'!A1`, a `javascript:` URL,
`http://user:pass@example.com`, `http://169.254.169.254/latest/meta-data/`, and an
over-length cell.

## 5. Admin navigation

`src/app/admin/layout.tsx` already resolves the latest event id and builds event-scoped
links (see its `getEventId()` and `navItems`). **Read it first and confirm this is still
true after Wave 1** — if the layout no longer has an event id in scope, add only the links
that are genuinely reachable and report the rest in `blockers`. Do not invent a route
parameter that is not there.

- Extract the item list into `src/lib/admin-nav.ts` as a pure function
  `adminNavItems(eventId: string | null): { href: string; label: string }[]`, preserving
  the current order and labels exactly, and have the layout call it.
- Append three event-scoped entries: `Roster Import`
  (`/admin/events/${eventId}/roster-import`), `Reschedule Requests`
  (`/admin/events/${eventId}/requests`), `Notifications`
  (`/admin/events/${eventId}/notifications`).
- Add a minimal placeholder `page.tsx` for each of those three routes — an admin-guarded
  server component rendering a heading and "Coming in this release." Each Wave 2 writer
  replaces its own placeholder. This keeps navigation unbroken mid-wave.

**Do not touch anything under `src/app/attorney/`.** The attorney login and callback must
stay outside any authenticated shell; W2B owns the attorney portal shell and the
`/attorney` root redirect.

## Files you own

`src/lib/db/schema.ts`, `drizzle/**`, `package.json`, `package-lock.json`,
`scripts/run-tests.mjs`, `src/lib/spreadsheet-safe.ts` (+ its test),
`src/lib/admin-nav.ts`, `src/app/admin/layout.tsx`, and the three placeholder
`page.tsx` files named above.

## Files you must not touch

Everything else. Specifically: any existing table definition, `src/lib/auth.ts`,
`src/lib/session.ts`, `src/lib/email/**`, `src/lib/practice-areas.ts`,
`src/app/attorney/**`, `src/app/portal/**`, `scripts/seed.ts`, `scripts/wipe.ts`,
anything under `docs/campaign-hq/` except your own report, anything under `work/`.

No feature logic. If you find yourself writing a server action, you have left scope.

## Verification

From your worktree root:

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

All four must pass. Do not weaken lint rules, add `eslint-disable`, use `@ts-ignore`, or
loosen `tsconfig`. Do not connect to any production database. Do not run `scripts/seed.ts`
or `scripts/wipe.ts` against anything.

Apply your migration to the local database to prove it runs, using the private config root
gave you (`ENV_FILE`), never the wrapper's default:

```bash
COUNSEL_TEST_ENV_FILE=ENV_FILE npm test
psql "$LOCAL_URL" -f drizzle/0001_wave2_additive.sql   # LOCAL_URL from ENV_FILE, never echoed
```

Then re-run the same SQL file a second time and confirm it fails cleanly on "already
exists" rather than partially corrupting anything, and confirm with a row count that the
eleven baseline tables are untouched. Root will separately run it against the restore
fixture.

## Commit

```
codex/w2-foundation: add wave 2 schema, migration, xlsx 0.20.3, test harness, admin nav
```

## Final report

Emit JSON matching `docs/campaign-hq/schemas/worker-result.json`. In `blockers`, include:
- the exact `xlsx` lock integrity line status (present/absent), or the CDN error text;
- whether Drizzle could express the partial unique index, or whether SQL diverges;
- the exact exported signatures of every table object and of `spreadsheet-safe.ts`, so root
  can paste them into the three writer briefs;
- whether the admin layout still has an event id in scope.

`status: done` only if all five sections are complete and all four verification commands
passed.

## Root dispatch clarifications
- Also make src/app/admin/layout.tsx explicitly force-dynamic: authenticated DB pages must not be statically prerendered at build time. This is a bounded baseline build correction in your owned layout.
- Root already excludes work/ and outputs/ from TypeScript and ESLint. These contain other worktrees/private artifacts; preserve those excludes. No source exclusion or rule weakening.
- If the SheetJS CDN is unavailable, finish all independent foundation sections and report that specific dependency blocker; never silently downgrade.
- Use the supplied private ENV_FILE explicitly, never inherited Railway/project settings or the root run-local wrapper (it forces root cwd). Apply W1 auth migration to your dedicated baseline-only local DB before your own SQL if needed. No production connections.
- Do not require a deliberate second failed migration execution as a gate; inspect non-idempotent DDL and prove one clean application + existing-table preservation. Root separately tests the restored production fixture.
- Prior workers already ran CodeRabbit and a separate Claude source review is active. Run focused tests plus lint/type/build; root owns combined cross-model review. Avoid repeated broad review passes in this bounded foundation task.
- No real PII in test outputs. For PDF/workbook references use already tracked files, report counts only.
