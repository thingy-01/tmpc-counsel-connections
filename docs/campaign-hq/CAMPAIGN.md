# Campaign: Counsel Connections September feedback
Goal: Implement the approved Granola feedback and release the tested changes to counsel-connections.org while preserving current data.
Status: phase 0 of 4, preflight and worker dispatch.

## Progress pulse
- Reporting interval: concise root updates within 60 seconds during active work; substantive phase reports and at least every 15 minutes.
- Last user report: kickoff September 3, 2026.
- Automatic continuation: active; implementation and live release already approved.

## Phases and gates
1. Foundation and data: onboarding/refresh fixes, normalized attorney practice data, previewed roster import. Evidence: tests and real browser walkthrough against isolated development DB.
2. Scheduling and attorney portal: company selections with conflict/privacy enforcement; attorney magic links and live schedule; staff-reviewed reschedule requests. Evidence: isolated role and race tests, mobile/print checks.
3. Notification and release review: previewed announcements, mail-merge export, additive migrations, separate-author/cross-model review, full lint/type/build verification.
4. Release: root integrates approved release candidate into remote main, applies safe migrations, deploys existing Railway target, verifies live public and authenticated workflows. No real participant mailing without specific authorization.

## Fleet
| Task | Worker | Branch | Worktree | Session | Dispatched | Status |
|---|---|---|---|---|---|---|
| Release preflight/local DB | Codex native agent release_preflight | none (scratch only) | work/release-preflight | /root/release_preflight | 2026-09-03 | running; expected 5 minutes |
| Implementation conductor | Claude Opus, high | codex/counsel-connections-dev | task root | pending | 2026-09-03 | pending preflight |

## Release target
Repository: thingy-01/tmpc-counsel-connections. Baseline: 93d1a0375945ca969f67c804505f2516d727997d, equal to origin/main at kickoff.
Railway: Counsel project 1adb346c-6acd-4d7e-92db-c09559b4bc14; production env 8f8dd39e-2b89-4bf4-873e-3ac3dd8ec92c; tmcp-interviews service f4badb5d-40ac-4ce1-95d1-9e406bd60d3c. Root must verify preflight report before release. Inherited Railway linkage points to Jurytics and must never be used.

## Coordination
Root coordinator owns release preflight, production configuration, release, and user communication. Claude conductor owns campaign implementation/docs, worker dispatch, local integration/review. Check work/ROOT-STEERING.md for new coordination instructions before each phase.
