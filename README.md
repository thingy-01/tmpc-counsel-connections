# Counsel Connections

Counsel Connections manages TMCP company profiles, attorney rosters, interview schedules, reschedule requests, and reviewed schedule announcements.

## Production configuration

Set these values before production traffic reaches the corresponding routes:

- `CLERK_ADMIN_ORG_ID`: the exact Clerk organization whose `org:admin` members are staff.
- `ATTORNEY_SESSION_SECRET`: at least 32 random bytes for attorney session cookies.
- `ATTORNEY_EMAIL_TRANSPORT=resend`: the production attorney email transport.
- `ATTORNEY_EMAIL_FROM`: a sender accepted by the configured Resend account.
- `RESEND_API_KEY`: the Resend API credential.
- `NEXT_PUBLIC_APP_URL=https://counsel-connections.org`: the canonical public origin used in attorney links.

The app fails closed when required runtime configuration is absent. Code cannot confirm sender-domain verification offline. Verify the sender in Resend before authorizing participant email.

The `capture` email transport is for local tests only. It refuses to run when `NODE_ENV=production`.

## Production migrations

Production has no migration ledger. Apply `0001`, `0002`, and `0003` exactly once after a backup and schema preflight. Use one external `psql` transaction so any error rolls back all three files.

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f drizzle/0001_attorney_magic_link_auth.sql \
  -f drizzle/0002_wave2_additive.sql \
  -f drizzle/0003_release_hardening.sql
```

Verify the expected tables, columns, indexes, foreign keys, and preserved baseline row counts before deployment. Do not rerun the files after a successful application.

Application rollback reverts and redeploys the prior application commit. Keep the additive schema in place; no destructive down migration is part of rollback.

## Local development

Copy `.env.local.example` to `.env.local`, configure a local PostgreSQL database, and install dependencies:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Run the verification gates with:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```
