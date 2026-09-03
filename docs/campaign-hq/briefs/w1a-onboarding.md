# Worker Brief: W1A - Onboarding, dialog freshness, practice-area model

You are a Codex CLI implementation worker. Work only inside your worktree. Do not spawn
subagents. Finish with a commit.

## Required reading before you edit

1. `docs/campaign-hq/reference/taxonomy.md` — canonical practice-area and
   organization-type lists, extracted from the registration PDF. Use it verbatim.
2. `docs/campaign-hq/APPROVED-PLAN.md` section 1, and section 2's practice-area paragraph.

## Environment facts

- Next.js **16.1.6**, App Router, React Server Components.
- Drizzle ORM. The production adapter is `drizzle-orm/neon-http`, which does **not**
  support `db.transaction()`. You do not need transactions here; do not introduce one.
- TypeScript strict mode. Tailwind. UI primitives in `src/components/ui`.

## Goal

### 1. Company onboarding destination

Company invite-code login currently always lands on `/portal`.

- A company whose profile is incomplete lands on `/portal/profile`.
- A company whose profile is complete lands on `/portal/schedule`.
- "Complete" means `contactName` and `contactEmail` are both non-empty. Put this predicate
  in one exported helper and reuse it everywhere; do not inline it twice.
- Keep `/portal` reachable through navigation.

### 2. Stale attorney dialog

`src/app/admin/events/[eventId]/attorneys/attorney-search.tsx` stores the whole selected
attorney object in React state and keeps passing that snapshot to
`attorney-manage-dialog.tsx` after server actions revalidate. Saved detail, availability,
and resume changes do not appear until the dialog is reopened.

- Track only the selected attorney **id** in client state.
- Derive the dialog's attorney object from current server props on every render by looking
  the id up in the refreshed list.
- If the id is gone (deleted attorney), close the dialog cleanly.
- Apply the same freshness to the availability list and the resume block.

### 3. Useful form errors

The availability form throws bare `Error`s from its server action, which surface as an
unhandled error instead of inline feedback.

- Convert `addUnavailability` / `removeUnavailability` to the
  `ActionResult = { ok, error? }` shape already used by `addAttorney` / `updateAttorney`,
  and render the message inline in the dialog.
- Do not change admin-only authorization on any of these actions.
- Investigate the availability error seen in the walkthrough and state its concrete cause
  in your report.

### 4. Practice-area model

`src/app/admin/events/[eventId]/attorneys/actions.ts` splits a comma string into
`string[]`, destroying the `{area, percent}[]` shape the seed writes.

- Create `src/lib/practice-areas.ts` holding the canonical list plus one parser/serializer
  pair used by every read and write path.
- Accept and preserve both legacy shapes on read: `string[]` and `{area, percent}[]`.
- Follow every compatibility rule in `docs/campaign-hq/reference/taxonomy.md`. Never
  invent a percentage, never silently remap a legacy label, never truncate a stored record
  that already has more than two areas.
- The edit form offers canonical options, allows at most two areas for a **new** edit, and
  requires two supplied percentages to sum to 100.
- Show an "incomplete imported data" indicator for records with areas lacking percentages,
  or with more than two areas. Do not auto-fix them.
- Add canonical organization-type options as a select that still renders and preserves an
  unrecognized stored legacy value.

Wave 2's roster importer will consume `src/lib/practice-areas.ts`. Export a clean,
documented API.

## Branch, worktree, base

- Branch: `codex/w1a-onboarding` (already checked out)
- Worktree: `/Users/thingy/Documents/Codex/2026-09-03/github-plugin-github-openai-curated-remote/work/trees/w1a-onboarding`
- Base commit: `461d305545aece601423da55c63898e5b44c834d`

## Files you own

- `src/app/portal/actions.ts`
- `src/app/portal/page.tsx` (only to match the new completeness rule)
- `src/app/login/page.tsx` and the invite-code redirect path
- `src/app/admin/events/[eventId]/attorneys/**`
- `src/lib/practice-areas.ts` (new)

## Files you must not touch

- `src/lib/auth.ts`, `src/lib/session.ts`, `src/lib/db/schema.ts`, migrations,
  `src/lib/email/**`, `src/app/attorney/**` — W1B owns
- `src/app/portal/schedule/**`, `src/app/admin/events/[eventId]/assignments/**`,
  `src/app/api/attorneys/[id]/resume/route.ts`, `src/components/attorney-picker.tsx` — W1C owns
- Anything under `docs/campaign-hq/` except your own report, and anything under `work/`

If you think you need an excluded file, stop and record it in `blockers`.

## Verification

From your worktree root:

```bash
npm run lint && npx tsc --noEmit
```

Both must pass. Do not weaken lint rules, add `eslint-disable`, use `@ts-ignore`, or
loosen `tsconfig` to make them pass.

## Commit

```
codex/w1a-onboarding: fix onboarding redirect, dialog freshness, practice-area model
```

## Final report

Emit JSON matching the supplied output schema. Set `status` honestly: `done` only if all
four items are complete and verification passed. Put the availability-error root cause and
any unfinished work in `blockers`.

## Root source accuracy correction (must read)
Distinct labels from the 2025 roster are not proof of the complete registration dropdown list. Extract the registration PDF form values before calling a taxonomy canonical. Preserve compatible existing values and unknown legacy percentages; do not invent a 100% default. The app uses Next.js 16.1.6. Returning completed-profile companies should proceed to their schedule under the approved plan; newly invited/incomplete companies go to profile.

Conductor note: the extraction root asked for is already done for you in
`docs/campaign-hq/reference/taxonomy.md`. Use that file rather than re-deriving the list,
and tell the conductor if you believe it is wrong.
