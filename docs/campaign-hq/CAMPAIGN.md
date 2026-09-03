# Campaign: Counsel Connections September feedback
Goal: Implement the approved Granola feedback and release the tested changes to counsel-connections.org while preserving current data.
Status: W1 commits integrated locally; cross-model corrections and W2 foundation active. Not released.

## Progress pulse
- Reporting interval: concise root updates within 60 seconds during active work; substantive phase reports and at least every 15 minutes.
- Last user report: worker lifecycle interruption explained; all edits preserved and workers resumed, 2026-09-03T16:22:21.191912+00:00.
- Automatic continuation: active; implementation and live release already approved.

## Wave 1 attempt 1: FAILED, no code produced
All three W1 workers failed at `turn.failed` with `invalid_json_schema` before any model
execution. Cause: `verify_result` in the output schema lacked `additionalProperties:false`.
The previous conductor read only head logs and incorrectly recorded the workers as running.
No feature code, commit, or worktree change resulted. Root fixed the schema, renamed the
branches from `campaign/w1*` to `codex/w1*`, and replaced the conductor runtime.

## Phases and gates
1. Foundation and data: onboarding/refresh fixes, normalized attorney practice data, previewed roster import. Evidence: tests and real browser walkthrough against isolated development DB.
2. Scheduling and attorney portal: company selections with conflict/privacy enforcement; attorney magic links and live schedule; staff-reviewed reschedule requests. Evidence: isolated role and race tests, mobile/print checks.
3. Notification and release review: previewed announcements, mail-merge export, additive migrations, separate-author/cross-model review, full lint/type/build verification.
4. Release: root integrates approved release candidate into remote main, applies safe migrations, deploys existing Railway target, verifies live public and authenticated workflows. No real participant mailing without specific authorization.

## Fleet
| Task | Worker | Branch | Worktree | Session | Dispatched | Status |
|---|---|---|---|---|---|---|
| Release preflight/local DB | Codex native agent release_preflight | none (scratch only) | work/release-preflight | /root/release_preflight | 2026-09-03 | complete; report at work/release-preflight/report.md |
| Design/review conductor | Claude Opus 5, high | codex/counsel-connections-dev | task root | 72df8991-0ed1-47a9-a994-27fbdbf663ed | 2026-09-03 | bounded invocations; not currently running |
| W1A: Onboarding/practice | Codex CLI | codex/w1a-onboarding | work/trees/w1a-onboarding | 01a06808-b314-72d2-8aa0-0bb261bdad29 | 2026-09-03 | committed9f6a40e, integrated90065b9; checks passed; corrections tracked separately |
| W1B: Attorney auth | Codex CLI | codex/w1b-attorney-auth | work/trees/w1b-attorney-auth | 01a06808-bb43-79e1-888c-da5296b35179 | 2026-09-03 | committed0f236a0, integrated4ee41ca; checks passed; access/login corrections tracked separately |
| W1C: Company scheduling | Codex CLI | codex/w1c-scheduling | work/trees/w1c-scheduling | 01a06808-c5de-71a1-aeed-4d771b4be803 | 2026-09-03 | committed925dab3, integrated0103c3e; local race tests passed; percentage integration correction active |

Collection rule: read the log **tail** and the exit-status file, never the head. A
`thread.started` line is not evidence of success.

## Wave 1 scope corrections folded into briefs
- Canonical taxonomy extracted from the registration PDF into
  `docs/campaign-hq/reference/taxonomy.md`. It differs from the 2025 roster: the form has
  `Taxation`, lacks `Not Applicable`, and uses shorter labels. Roster values are legacy.
- `db.transaction()` is unusable in production (neon-http). All atomicity must be
  single-statement SQL over the existing unique constraints.
- The resume route `src/app/api/attorneys/[id]/resume/route.ts` had no owner and currently
  leaks across events; assigned to W1C with an explicit role allowlist.
- Six P1 findings in `work/reviews/auth-scheduling-precheck.md` are binding on W1B and W1C.

## Release target
Repository: thingy-01/tmpc-counsel-connections. Baseline: 93d1a0375945ca969f67c804505f2516d727997d, equal to origin/main at kickoff.
Railway: Counsel project 1adb346c-6acd-4d7e-92db-c09559b4bc14; production env 8f8dd39e-2b89-4bf4-873e-3ac3dd8ec92c; tmcp-interviews service f4badb5d-40ac-4ce1-95d1-9e406bd60d3c. Root must verify preflight report before release. Inherited Railway linkage points to Jurytics and must never be used.

## Coordination
Root coordinator owns release preflight, production configuration, release, and user communication. Root directly supervises worker processes, campaign state, and mechanical integration. Claude Opus provides bounded design and separate-author review. No Claude print-mode invocation owns long-lived background workers. Check work/ROOT-STEERING.md for new coordination instructions before each phase.

## Wave 1 process interruption and recovery
The Opus5 print-mode conductor returned a status report and exited0 at 16:13:42Z. Its CLI killed all background Bash workers and the waiter. Partial edits survived, with no worker final reports/commits. Root verified status:killed events and absent processes, then resumed the same Codex sessions via direct exec. This is lifecycle recovery, not a permission bypass. All source preserved.

## Verified release preparation
- Private full backup restored into separate local counsel_connections_restore_check database; 11 tables, current counts and uniqueness constraints preserved. Evidence under work/release-preflight.
- Actual installed Neon HTTP driver passed a read-only production SELECT1; execute() returns object.rows.
- Full production email configuration remains unresolved; user was asked provider/sender details asynchronously.
- Jen/Tracy names are unidentified meeting references, per user's clarification; leave current staff memberships unchanged. This does not block feature implementation.

## Wave 1 integration checkpoint
- W1A source9f6a40e integrated90065b9; W1B source0f236a0 integrated4ee41ca; W1C source925dab3 integrated0103c3e. Root reran lint/typecheck after integration. Worker builds/local concurrency tests passed; none of this is production deployment.
- Root excluded ignored work/ and outputs/ from ESLint/TypeScript to avoid scanning private scratch and nested worker checkouts (b3f3f2b). No app source excluded.
- Claude Opus separate-author snapshot report work/reviews/w1-cross-model.md found substantive login/policy/legacy-preservation integration fixes. Codex correction brief w1-integration-corrections.md owns them; final integrated re-review remains.
- W2 foundation active branch codex/w2-foundation in work/trees/w2-foundation fromfbfae1a (W1A+B; C has no ownership overlap), direct exec46176/logwork/w2-foundation.jsonl. Schema, SheetJS upgrade, test runner, navigation only.
- W2A/B/C briefs prepared by Claude Opus5/high. Root launches from reviewed foundation+corrections+W1C merged base; no overlapping schema writers.
- Synthetic QA fixture ready counsel_campaign_qa; private configwork/release-preflight/.env.qa.local; guideqa-guide.md. No production changes.

## Current active processes (supersedes old dispatch state)
- W2 foundation: codex/w2-foundation, work/trees/w2-foundation, Codex01a06825-9769-7620-b6e2-4e206f6d23d0, directexec46176, logwork/w2-foundation.jsonl. SheetJS0.20.3 installed via isolated npm cache after global cacheEPERM; schema implementation underway.
- W1 integration corrections: codex/w1-integration-corrections, work/trees/w1-integration-corrections, base101622d, Codex01a06826-e64b-7760-843e-85c34ea0f2a6, directexec25511, logwork/w1-corrections.jsonl. Private localDB counsel_w1_corrections/config.env.w1-corrections.local.
- Root local QA admin Next dev: directexec49118, localhost3000, synthetic counsel_campaign_qa, W1auth additiveSQL applied only here.
- Aside admin browser QA: directexec91183, logwork/aside-w1-admin.log, Asidesession2026-09-03_aGkMULLNkrKOtBJG. Testing local dialog refresh/availability/resume/mobile; observed city immediate save. Root must stop this server before switchingrole or building.
- Bounded Claude design/briefs and W1snapshotreview finished (exec47107/74309 bothexit0); no backgroundworkers. Work/reviews/w1-cross-model.md is snapshot, not final integrated gate.
