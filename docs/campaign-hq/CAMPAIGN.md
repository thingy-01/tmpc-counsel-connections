# Campaign: Counsel Connections September feedback

Goal: Implement the approved Granola feedback and release the tested changes to counsel-connections.org while preserving current data.

Status: Released to counsel-connections.org on September 3, 2026. Railway deployment `5a3049f4-e9fd-4ce3-bb73-fe9a66398ac1` successfully promoted application commit `c45742b6d5a2677e228fce572852453ddaeb7a27` after the production email configuration and additive migrations were verified.

## Release candidate

The integrated release includes:

- Attorney onboarding fixes and normalized practice-area percentages that preserve legacy values.
- Previewed, correctable, idempotent roster import with bounded workbook parsing, safe résumé references, and preservation of unmapped optional fields.
- Company scheduling with event, ownership, conflict, and privacy enforcement plus printable review views.
- One-time attorney sign-in links, an attorney-only schedule, print support, logout, and replay-safe token handling.
- Attorney reschedule requests with staff review, private notes, atomic booking moves, and attorney-visible status history.
- Immutable notification previews, explicit authorization, capture and Resend transports, stable idempotency keys, bounded retries, interrupted-send leases, recipient results, and assignment workbook export.
- Additive migrations `0001`, `0002`, and `0003` for attorney authentication and Wave 2 data.

- Repository: `thingy-01/tmpc-counsel-connections`
- Release branch: `codex/counsel-connections-dev`
- Integrated application head: `c45742b6d5a2677e228fce572852453ddaeb7a27`
- Production target: the existing Counsel Connections Railway project and `tmcp-interviews` service. Commands must always name the intended project, environment, and service explicitly because the inherited local Railway link points elsewhere.

## Completed verification

- Repository gates passed at the integrated release candidate: ESLint, strict TypeScript, 54 database-configured tests, and the Next.js production build.
- Separate Claude and CodeRabbit reviews completed. Accepted findings were corrected and targeted checks were rerun.
- Browser acceptance passed against an isolated local PostgreSQL fixture for roster preview/correction/apply/idempotency, résumé preservation, notification preview and capture delivery, export and print, attorney sign-in/schedule/request/history/logout/replay, staff review and rescheduling, and company-scoped schedule views.
- The browser checks confirmed that internal assignment notes and staff-only review notes do not appear in fresh attorney notifications, the attorney portal, or company views.
- A fresh production archive restored into a newly named local database. Migrations `0001`, `0002`, and `0003` applied together with `ON_ERROR_STOP` in one transaction. All 11 original table counts and deterministic content fingerprints, assignment relationships, and résumé relationships remained identical. The result contained exactly 20 tables, all nine additive tables were empty, and the expected indexes, foreign keys, and notification lease column matched.
- A fresh production backup was captured immediately before release. Migrations `0001`, `0002`, and `0003` then applied once in a single transaction. All 11 original tables and their row counts and relationships were preserved, the final schema contained the expected 20 tables, and all nine additive tables began empty.
- Resend verified `counsel-connections.org`; the domain-restricted sending key and approved sender were stored only in Railway. No real participant email was sent during implementation, release, or verification.
- Railway deployed commit `c45742b6d5a2677e228fce572852453ddaeb7a27` successfully. Live checks confirmed the public site, attorney login, Clerk-protected admin redirect, signed-in master schedule, attorney roster, notification center, preserved event data, and foreign-origin rejection. The new deployment produced no HTTP 5xx responses during acceptance.

## Release result

The approved campaign scope is live. Notification batches remain unsent until a staff operator previews and explicitly authorizes a batch in the application. The preserved pre-migration archive and prior Railway revision remain available as rollback evidence.

## Runtime status

No campaign worker or local QA server remains active. The campaign is complete; production is running the reviewed release and no participant notification has been sent.

## Historical process note

The first Wave 1 dispatch failed before model execution because the worker output schema omitted `additionalProperties:false` in a nested object. A later print-mode conductor exit stopped background workers. Both incidents produced no lost source work: root corrected the schema, verified process exits from log tails, and resumed preserved work. Durable operating rules are recorded in `LEARNINGS.md`.
