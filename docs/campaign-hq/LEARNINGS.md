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
