# Campaign: Counsel Connections September feedback

Goal: Implement the approved Granola feedback and release the tested changes to counsel-connections.org while preserving current data.

Status: Released to counsel-connections.org on September 3, 2026. The latest attorney authentication correction preserves direct schedule entry while preventing mail scanners from consuming one-use links.

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

## Company profile completion follow-up

- Incomplete companies now go to `/portal/profile?onboarding=1` after login.
- Direct visits to company home, interviewer management, scheduling, and schedule review also redirect incomplete companies to the profile.
- The profile page explains that the primary contact name and email must be saved before the remaining portal features become available.
- The portal navigation shows only Company Profile until the required contact fields are complete.
- Completed companies keep the existing schedule destination and full portal navigation.
- CodeRabbit reported no findings. All 56 tests, strict TypeScript, ESLint, the production build, and synthetic browser acceptance passed.
- Railway deployment `8ae34bfe-d3a4-4004-8fbe-1100ebd5fe81` succeeded for `f70d8c2d61f5d045028b13380c82e18feb14d741`. Live portal routes returned 200 with no observed deployment 5xx responses.

## Public landing-page role follow-up

- The public page now has distinct Company, Attorney, and Staff tiles.
- Company identifies representatives who conduct interviews and links to the invite-code portal.
- Attorney identifies attorneys who are interviewed and links to email sign-in.
- Staff identifies TMCP administrators and links to staff sign-in.
- CodeRabbit reported no findings. ESLint, strict TypeScript, the production build, responsive browser review, and live text and link checks passed.
- Railway deployment `a222db65-42d6-4d1e-a2de-8066327e8bce` succeeded for `eac572a7c35a7ae8a99e4b55d3d9dca20e62b83c`.

## Attorney public-redirect correction

- Attorney login-request, callback success and error, and logout redirects now use one validated public application origin.
- Railway's internal `localhost:8080` request origin can no longer appear in these redirect destinations.
- The callback still reads the one-time token from the incoming request URL before it builds the public response destination.
- CodeRabbit reported no findings. All 60 tests, ESLint, strict TypeScript, and the production build passed.
- Railway deployment `9ef6a282-20a0-48cd-9668-0cd612b99b05` succeeded for `e0bd209738f4c0b3e85cfc518ce6842bd0b1edef`.
- Live non-delivering checks returned public `counsel-connections.org` locations for login request, invalid callback, and logout redirects.

## Direct attorney magic-link follow-up

- Production evidence showed that mail security scanners execute the auto-submit JavaScript from release `98cb813`, consuming four fresh tokens before the recipients reached them. That mitigation is not scanner-safe.
- The replacement callback redeems GET only when `Sec-Fetch-User: ?1`, navigation mode, and document destination identify a user-activated top-level navigation. Scanner-like, prefetch, and metadata-free GETs remain read-only and return an inert same-origin POST button.
- Redirecting email wrappers and older browsers may omit the user-activation signal and show the fallback button. A non-browser scanner can synthesize headers, so the signal reduces risk but is not cryptographic proof of a human click.
- Invalid, expired, and reused tokens still redirect to the public attorney login error page.
- The callback keeps private no-store and referrer-restriction headers and uses the configured public origin behind Railway.
- The integrated database callback suite passed 15 of 15 tests. The default suite passed 50 tests with 11 expected database skips. ESLint, strict TypeScript, and the production build passed.
- Release commit `57181a1` contains the stronger user-navigation correction.

## Runtime status

Production runs the stronger user-navigation callback correction. No participant notification batch has been sent.

## Historical process note

The first Wave 1 dispatch failed before model execution because the worker output schema omitted `additionalProperties:false` in a nested object. A later print-mode conductor exit stopped background workers. Both incidents produced no lost source work: root corrected the schema, verified process exits from log tails, and resumed preserved work. Durable operating rules are recorded in `LEARNINGS.md`.
