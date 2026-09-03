# Campaign: Counsel Connections September feedback

Goal: Implement the approved Granola feedback and release the tested changes to counsel-connections.org while preserving current data.

Status: Final integrated release candidate complete at `3d0fb8c2e4a73d5ebc7530e833f42d6bce2a0090`. Implementation, independent reviews, local browser acceptance, and the restored-production migration rehearsal are complete. Live release is waiting only for production email-provider credentials and an approved sender identity; production migration, deployment, and live verification follow that external configuration.

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
- Integrated application head: `3d0fb8c2e4a73d5ebc7530e833f42d6bce2a0090`
- Production target: the existing Counsel Connections Railway project and `tmcp-interviews` service. Commands must always name the intended project, environment, and service explicitly because the inherited local Railway link points elsewhere.

## Completed verification

- Repository gates passed at the integrated release candidate: ESLint, strict TypeScript, 54 database-configured tests, and the Next.js production build.
- Separate Claude and CodeRabbit reviews completed. Accepted findings were corrected and targeted checks were rerun.
- Browser acceptance passed against an isolated local PostgreSQL fixture for roster preview/correction/apply/idempotency, résumé preservation, notification preview and capture delivery, export and print, attorney sign-in/schedule/request/history/logout/replay, staff review and rescheduling, and company-scoped schedule views.
- The browser checks confirmed that internal assignment notes and staff-only review notes do not appear in fresh attorney notifications, the attorney portal, or company views.
- A fresh production archive restored into a newly named local database. Migrations `0001`, `0002`, and `0003` applied together with `ON_ERROR_STOP` in one transaction. All 11 original table counts and deterministic content fingerprints, assignment relationships, and résumé relationships remained identical. The result contained exactly 20 tables, all nine additive tables were empty, and the expected indexes, foreign keys, and notification lease column matched.
- No production data was changed and no real participant email was sent during implementation or verification.

## Remaining release gate

One external blocker remains: configure and verify the production email provider and approved sender identity. Those values belong only in the hosting provider's secret store and must never be committed. Root will also verify the canonical public URL, attorney session secret, and existing staff organization binding during the release; those are operator checks rather than additional external dependencies.

After that configuration is verified, the authorized release operator will:

1. Confirm the exact production project, environment, service, branch, and current deployed revision.
2. Take a fresh pre-migration backup.
3. Apply migrations `0001`, `0002`, and `0003` once in order with `ON_ERROR_STOP` inside one transaction.
4. Verify original-table counts and relationships before deploying the integrated application head.
5. Deploy the existing service and verify public, staff, company, and attorney flows through the live hosting proxy, including sender acceptance and one approved test delivery.
6. Keep participant notification batches unsent until separately authorized.

Rollback uses the preserved pre-migration archive and the previously deployed application revision. Because `0002` and `0003` are additive and not intended for blind reapplication, a failed migration stops the release for diagnosis rather than being rerun.

## Runtime status

No campaign worker, local QA server, or browser run remains active. The campaign is paused at the external email-configuration gate. Root owns the production migration, deployment, live verification, rollback decision, and user communication.

## Historical process note

The first Wave 1 dispatch failed before model execution because the worker output schema omitted `additionalProperties:false` in a nested object. A later print-mode conductor exit stopped background workers. Both incidents produced no lost source work: root corrected the schema, verified process exits from log tails, and resumed preserved work. Durable operating rules are recorded in `LEARNINGS.md`.
