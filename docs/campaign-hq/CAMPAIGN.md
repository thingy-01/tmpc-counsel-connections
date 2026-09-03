# Campaign: Counsel Connections September feedback
Goal: Implement the approved Granola feedback and release the tested changes to counsel-connections.org while preserving current data.
Status: phase 1 of 4, Wave 1 attempt 2 running.

## Progress pulse
- Reporting interval: concise root updates within 60 seconds during active work; substantive phase reports and at least every 15 minutes.
- Last user report: Wave 1 attempt 2 dispatched, September 3, 2026.
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
| Implementation conductor | Claude Opus 5, high | codex/counsel-connections-dev | task root | current session | 2026-09-03 | active |
| W1A: Onboarding/practice | Codex CLI | codex/w1a-onboarding | work/trees/w1a-onboarding | attempt 2 | 2026-09-03 | running; log work/w1a-log.jsonl |
| W1B: Attorney auth | Codex CLI | codex/w1b-attorney-auth | work/trees/w1b-attorney-auth | attempt 2 | 2026-09-03 | running; log work/w1b-log.jsonl |
| W1C: Company scheduling | Codex CLI | codex/w1c-scheduling | work/trees/w1c-scheduling | attempt 2 | 2026-09-03 | running; log work/w1c-log.jsonl |

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
Root coordinator owns release preflight, production configuration, release, and user communication. Claude conductor owns campaign implementation/docs, worker dispatch, local integration/review. Check work/ROOT-STEERING.md for new coordination instructions before each phase.
