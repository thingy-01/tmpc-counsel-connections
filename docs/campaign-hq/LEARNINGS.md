# Campaign learnings

## Standing rules
- Never infer worker success from startup output. Read the log tail and the process exit
  status. `thread.started` and `turn.started` prove only that a process launched.
- Codex `--output-schema` requires `additionalProperties:false` on every nested object, not
  just the root. A violation fails the turn before the model runs.
- Codex dispatch flags: absolute `--output-schema`, absolute `-o`, absolute `-C`, and
  `--add-dir <abs>/.git` as a plain path. A `:rw` suffix is not valid.
- Bash tool cwd persists between calls; always use absolute paths in dispatch commands.
- Always qualify Railway project/environment/service. Inherited linkage points to unrelated Jurytics.
- Interviewee dropdowns are attorney fields, not the company interviewers form. Company practice areas stay free text.
- Existing seed preserves structured practice percentages; manual editor currently strips them. Unify representation without inventing missing data.
- Attorney dialog holds a stale object snapshot after refresh. Verify the displayed state, not only server action success.
- Reuse 2025 roster/registration fixtures already tracked in data/. Current missing export fields remain an external data dependency.

## Log
- September 3, 2026: Wave 1 attempt 2 dispatched with corrected briefs, absolute paths, and
  `--add-dir <abs>/.git` (no `:rw` suffix).
- September 3, 2026: registration PDF taxonomy extracted with `pdftotext -layout` into
  `docs/campaign-hq/reference/taxonomy.md`. It contradicts the roster-derived list the first
  briefs used: the form offers `Taxation` and omits `Not Applicable`, and its labels are
  shorter (`International`, `Appellate`, `Immigration`, `Labor & Employment`,
  `Personal Injury/Tort Lit`). Confirms root's warning that observed roster values are not a
  dropdown list.
- September 3, 2026: all three W1 workers failed at `turn.failed` with `invalid_json_schema`
  before any model execution, because `verify_result` lacked `additionalProperties:false`.
  The conductor read head logs, saw `thread.started`, and recorded false progress.
- September 3, 2026: approved implementation plan and live release; parent preserves earlier checkout/worktrees.

- September 3: Claude print-mode exited after a progress report and killed its background workers. Root preserved edits and resumed worker sessions directly. Live process and terminal result checks are mandatory; a started job is not proof of ongoing work.
- September 3: XLSX percentages use fractional numbers with 0% format; legacy seed stores 0.5 for50%. Normalize meaning without inventing missing data.

- Root app checks must exclude ignored work/ and outputs/; nested worker checkouts otherwise get linted/compiled as app source. Stage all new feature source before CodeRabbit so it reviews added files, not just tracked diffs.
- Combined review found per-value percentage rescaling and mandatory repair of unchanged legacy data despite isolated CodeRabbit passes. Shared semantics and cross-model integration review remain required.
- September 3: production mail scanners both executed callback JavaScript and generated requests indistinguishable from user-activated navigation, so neither auto-submit nor Fetch Metadata prevented denial of one-use links. Treat the random token as a secure 15-minute bearer credential: allow repeat redemption only before its fixed expiry and use `coalesce(used_at, now())` to preserve the first-use audit timestamp. This prevents scanner denial at the cost of replayability during the short validity window.
- September 3: immutable notification previews correctly preserve the exact content an operator reviewed, which also makes privacy mistakes durable. Remove staff-only fields from the audience projection before rendering, generate a new preview to prove the fix, and never rewrite an older stored preview; leave the old unsent row as audit evidence.
- September 3: notification delivery needs a lease on the `sending` state. Retry may reclaim an expired or missing lease with the same stable provider idempotency key, while per-recipient timeouts advance that recipient's bounded retry state without aborting unrelated recipients.
- September 3: roster updates must distinguish an unmapped column from a mapped blank cell. Preserve an existing optional value when its column was not mapped; clear it only when the operator mapped that field and the imported cell is blank.
- September 3: release completed only after the provider domain was verified, a fresh production backup was captured, the additive migrations preserved every original table count and relationship, Railway promoted the exact reviewed commit, and the signed-in production UI showed the preserved event records. Configuration, migration, deployment, and live acceptance are separate milestones.
