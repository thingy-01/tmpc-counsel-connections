# Worker Brief: W1B - Attorney magic-link auth and email delivery

You are a Codex CLI implementation worker. Work only inside your worktree. Do not spawn
subagents. Finish with a commit.

This is a security-critical task. A reviewer will adversarially test it.

## Required reading before you edit

`work/reviews/auth-scheduling-precheck.md`, findings **4** and **5**. They are binding
requirements, not suggestions. Their "Acceptance" paragraphs describe how this work will
be tested. Finding 1 in that file explains the database driver constraint below.

## Environment facts

- Next.js **16.1.6**, App Router.
- `src/lib/db/index.ts` selects `drizzle-orm/neon-http` for Neon URLs and node-postgres
  otherwise, hiding the difference behind a type cast. **`db.transaction()` throws
  `No transactions support in neon-http driver` in production.** Every atomic operation
  must be a single conditional SQL statement.
- Clerk middleware currently wraps all routes. The attorney login and callback paths must
  work without a Clerk session while staff protection stays intact.
- Production has **no** email provider key and **no** `NEXT_PUBLIC_APP_URL` today. Root is
  resolving provider setup. Your job is to make the code correct and clearly
  configuration-gated, not to obtain credentials.
- Existing company sessions fall back to `CLERK_SECRET_KEY` for signing, and to a public
  development secret if nothing is set. Do not copy that fallback into attorney sessions.

## Goal

### 1. Token storage and atomic consumption

- Add an additive `attorney_tokens` table. Additive only: `CREATE TABLE` / `ADD COLUMN`.
  Never `ALTER` an existing column or `DROP` anything. Production has no migration ledger,
  so also write the reviewed SQL to a file under `drizzle/`.
- Bind each token to a specific attorney enrollment **and** event.
- Tokens are cryptographically random and opaque. Store only a hash. Never log a token.
- Redeem with one conditional statement of the form
  `UPDATE ... SET used_at = coalesce(used_at, now()) WHERE token_hash = ... AND expires_at > now() RETURNING ...`.
  Create a session only when exactly one row comes back. Concurrent redemptions during
  the lifetime may create sessions while preserving the first `used_at` value.
- Lifetime 15 minutes. Reusable only until that fixed expiry so automated mail scanning
  cannot invalidate the recipient's copy of the link.

### 2. Rate limiting

- Maximum 3 delivery attempts per normalized email per 15 minutes.
- The counter must live in shared storage and survive restarts and multiple processes. A
  process-local map is not acceptable. A count-then-insert sequence is not acceptable;
  make the increment-and-test atomic in one statement.

### 3. Enumeration resistance

- Known, unknown, and throttled addresses must be outwardly indistinguishable: same
  status, same body, same redirect, no timing tell that depends on a database lookup.
- Delivery and configuration failures must not reveal whether an address is enrolled.

### 4. Session binding and lifetime

- Sign a versioned, role-specific payload that includes the attorney enrollment id, the
  event id, and an **expiry the server checks on every request**. Do not trust cookie
  `maxAge`.
- Require a real signing secret in production. The development fallback must be impossible
  when `NODE_ENV === "production"`; fail closed instead.
- Normalize email consistently. If one normalized address matches two enrollments in the
  same event through case variants, treat it as ambiguous and refuse rather than picking
  one arbitrarily. Do not modify existing rows to fix this.
- Revalidate on each request that the bound enrollment still exists.
- The same address may be enrolled in several events. Never show or authorize another
  event's data. Reject hand-edited event ids.
- Adding the attorney role must not widen any existing authorization check. Specifically,
  do not turn any `role !== null` test into something that now admits attorneys. Keep
  staff and company resolution explicit so a stale parallel cookie cannot select the wrong
  portal identity.

### 5. Email delivery

- Create `src/lib/email/` with a transport interface, a **real Resend implementation** as
  the production default, and a local capture transport for tests that writes to ignored
  `work/`.
- Local capture must be impossible in production: refuse to start or refuse to send, and
  say why. Never write a live magic link to disk in production.
- Missing configuration must fail loudly and clearly, naming the missing variable.
- Record every required environment **key name** in your report. Never print a value.

### 6. Attorney login page

- `/attorney/login` requests a link; the callback consumes it and starts the session.
- Do not build the attorney schedule view. Wave 2 owns it.

## Branch, worktree, base

- Branch: `codex/w1b-attorney-auth` (already checked out)
- Worktree: `/Users/thingy/Documents/Codex/2026-09-03/github-plugin-github-openai-curated-remote/work/trees/w1b-attorney-auth`
- Base commit: `461d305545aece601423da55c63898e5b44c834d`

## Files you own

- `src/lib/auth.ts`, `src/lib/session.ts`
- `src/lib/db/schema.ts` and `drizzle/**`
- `src/lib/email/**` (new)
- `src/app/attorney/**` (new)
- `src/proxy.ts` / middleware, only as needed to exempt the attorney login and callback
  paths without weakening staff protection

## Files you must not touch

- `src/app/admin/events/[eventId]/attorneys/**`, `src/lib/practice-areas.ts`,
  `src/app/portal/actions.ts`, `src/app/login/page.tsx` — W1A owns
- `src/app/portal/schedule/**`, `src/app/admin/events/[eventId]/assignments/**`,
  `src/app/api/attorneys/[id]/resume/route.ts`, `src/components/attorney-picker.tsx` — W1C owns
- Anything under `docs/campaign-hq/` except your own report

You may add to `src/lib/db/schema.ts`, but do not modify existing table definitions there.

## Verification

From your worktree root:

```bash
npm run lint && npx tsc --noEmit
```

Both must pass. Do not weaken lint rules, add `eslint-disable`, use `@ts-ignore`, or
loosen `tsconfig` to make them pass. Do not connect to any production database. Do not
send real email.

## Commit

```
codex/w1b-attorney-auth: add attorney magic-link auth and email adapter
```

## Final report

Emit JSON matching the supplied output schema. In `blockers`, list required environment
**key names** and anything you could not verify without a provider account.

## Root release requirements (must read)
Production delivery must have a real Resend implementation, not a placeholder as the earlier draft text suggests. It can fail clearly when keys are absent; local capture must be impossible in production. Root is resolving account/sender setup. A valid token may establish sessions until its fixed 15-minute expiry and must atomically preserve its first-redemption audit timestamp under concurrent requests. Rate limiting should survive multiple processes/restarts sufficiently for deployment; unknown email requests must not reveal enrollment. Existing Clerk middleware currently wraps all routes; explicitly account for a truly separate attorney login/callback path while preserving staff protection. Source is Next.js 16.1.6, not version 15 in the boilerplate above.
