# Phase 1 report: Wave 1 dispatch

Date: September 3, 2026. Author: Claude Opus 5 conductor. Status: workers running.

## Most important result

Wave 1 attempt 1 produced no code. All three Codex workers stopped at `turn.failed` with
`invalid_json_schema`. Attempt 2 is running correctly and is executing tool calls.

## Attempt 1 failure

- Cause: `verify_result` in `docs/campaign-hq/schemas/worker-result.json` did not set
  `additionalProperties: false`. Codex rejects the request before the model runs.
- The previous conductor read only the head of each log, saw `thread.started`, and recorded
  the workers as running. This was incorrect.
- Evidence of no effect: all three worktrees remained at `461d305`, `docs/campaign-hq/out/`
  contained only `.gitkeep`, and no branch had a commit.
- Root fixed the schema and renamed the branches to the `codex/` prefix.

## Attempt 2 dispatch

Command shape, per worker:

```sh
codex exec --json -s workspace-write \
  -c approval_policy=never \
  -c sandbox_workspace_write.network_access=true \
  --add-dir <abs-repo>/.git \
  --output-schema <abs-repo>/docs/campaign-hq/schemas/worker-result.json \
  -C <abs-repo>/work/trees/<task> \
  -o <abs-repo>/docs/campaign-hq/out/<task>.json \
  - < <abs-repo>/docs/campaign-hq/briefs/<task>.md
```

Corrections applied against attempt 1: absolute schema, report, and worktree paths; a plain
absolute `.git` path for `--add-dir` with no `:rw` suffix; logs and exit status written to
ignored `work/`.

Health at first check: each worker shows `command_execution` and `agent_message` events and
zero `invalid_json_schema`. The one `error` event per worker is the benign Codex
"chronicle" under-development warning.

## Brief corrections folded in before dispatch

1. **Taxonomy.** The registration PDF was extracted with `pdftotext -layout` into
   `docs/campaign-hq/reference/taxonomy.md`. It contradicts the roster-derived list used in
   attempt 1: the form offers `Taxation`, omits `Not Applicable`, and uses shorter labels
   (`International`, `Appellate`, `Immigration`, `Labor & Employment`,
   `Personal Injury/Tort Lit`). Roster values are legacy data that must keep working.
2. **Driver.** `db.transaction()` throws on `neon-http` in production. The invalid
   transaction example was removed from the W1C brief. Atomicity must be single-statement
   SQL over the two existing unique constraints.
3. **Resume route owner.** `src/app/api/attorneys/[id]/resume/route.ts` had no owner and
   currently accepts any non-null role, then fetches by attorney id alone. Assigned to W1C
   with an explicit role allowlist so W1B's new attorney role inherits nothing.
4. **Precheck findings.** The six P1 items in `work/reviews/auth-scheduling-precheck.md` are
   quoted as binding requirements in the W1B and W1C briefs.
5. **Framework version.** Next.js 16.1.6 stated in all three briefs.

## Conductor findings from independent audit

- **No test framework is installed.** Dependencies include `tsx` and `dotenv` but no
  vitest, jest, or playwright. Wave 3 behavior tests will either add a framework or follow
  the repository's existing pattern of `tsx`/Python scripts driven through
  `src/app/api/dev-harness/route.ts`. Decision deferred to Wave 3 integration.
- **Middleware is narrower than reported.** `src/proxy.ts` enforces Clerk only on
  `/admin(.*)`; the company portal and resume route are already exempt. W1B therefore should
  not need an invasive middleware change to add `/attorney`. The conductor will check W1B's
  diff for unnecessary middleware edits.
- **`src/app/api/dev-harness/route.ts` is a shared edit risk.** It imports and re-exports
  most server actions, so a signature change in W1A and new actions in W1B or W1C can all
  touch it. Conflicts there are mechanical and will be resolved at integration.

## What this evidence does not prove

No feature code has been reviewed, no verification command has been rerun by the conductor,
and no commit exists yet. Worker self-reports will be treated as claims until the conductor
inspects each diff and reruns `npm run lint && npx tsc --noEmit`.

## Next action

Conductor collects the three reports, inspects diffs, reruns verification, then integrates
in dependency order W1A, W1B, W1C. No user action is required.
