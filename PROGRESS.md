# TMPC Counsel Connections — Progress Tracker

## Phase 1: Foundation ✅

### Completed
- [x] **Next.js project initialized** — Next.js 15 (actually 16.1.6 from latest), App Router, TypeScript, Tailwind CSS v4, ESLint
- [x] **Dependencies installed** — @clerk/nextjs, drizzle-orm, @neondatabase/serverless, drizzle-kit, xlsx, shadcn/ui, dotenv, tsx
- [x] **shadcn/ui initialized** — Default config, button and card components added
- [x] **.gitignore updated** — Added node_modules, .next, .env.local, raw_extract/, *.zip
- [x] **Clerk authentication set up**
  - Middleware protecting `/admin` and `/portal` routes
  - Sign-in page at `/sign-in/[[...sign-in]]`
  - Sign-up page at `/sign-up/[[...sign-up]]`
  - Placeholder env vars in `.env.local` and `.env.local.example`
- [x] **Neon database + Drizzle ORM configured**
  - Complete schema in `src/lib/db/schema.ts` (11 tables)
  - DB connection in `src/lib/db/index.ts`
  - `drizzle.config.ts` for migrations
- [x] **Auth helpers** — `src/lib/auth.ts` with role resolution (admin vs company)
- [x] **App structure created**
  - Root layout with ClerkProvider
  - Landing page with sign-in cards
  - Admin layout with sidebar navigation and role check
  - Portal layout with sidebar navigation and role check
  - Admin dashboard placeholder
  - Portal home with step-by-step guide
  - Placeholder pages for register, interviewers, schedule, events
- [x] **Seed script created** — `scripts/seed.ts`
  - Parses 03C attorney breakdown (100+ attorneys with practice areas)
  - Parses 04 assignments (3 sheets: Selected, Not Selected, Cancelled)
  - Creates 2025 event with 4 days, breaks, time slots
  - Creates 15 companies with interviewers
  - Imports assignments and handles unavailability
- [x] **Build succeeds** — `npm run build` and `npm run dev` both work
- [x] **Git commits** — 3 commits with descriptive messages

### Decisions Made
1. **Next.js version**: `create-next-app@latest` installed Next.js 16.1.6 (not 15 as planned). This is fine — it's backward compatible.
2. **Middleware deprecation**: Next.js 16 shows a warning that "middleware" is deprecated in favor of "proxy". The middleware still works, but should be migrated in a future phase.
3. **Tailwind v4**: The latest Next.js uses Tailwind CSS v4, which is slightly different from v3 (no tailwind.config.ts, uses CSS-based configuration).
4. **Event day times**: Based on actual data analysis:
   - Monday Oct 6 (Virtual): 9:00 AM – 5:00 PM with breaks at 11:15, 12:15, 12:45-1:30
   - Tuesday Oct 7 (In-Person): 2:00 PM – 5:00 PM with break at 3:30-3:45
   - Wednesday Oct 8 (In-Person): 1:45 PM – 5:00 PM with break at 3:30-3:45
   - Thursday Oct 9 (In-Person): 9:00 AM – 12:00 PM with break at 10:30-10:45
5. **Attorney emails**: Some attorneys in the 03C file don't have emails (that file doesn't include emails). Emails are sourced from the 04 assignments file. Attorneys missing from both get placeholder emails.
6. **Companies from data**: 15 companies found (including Capital One and Trellix which weren't in PLAN.md's list). Flotek Industries appears only in the Cancelled sheet.

### Before Next Phase
- [ ] Joshua provides real Clerk API keys → update `.env.local`
- [ ] Joshua provisions Neon database → update `DATABASE_URL`
- [ ] Run `npx drizzle-kit push` to create tables
- [ ] Run `npx tsx scripts/seed.ts` to populate data
- [ ] Deploy to Vercel

---

## Feature Round 2: Interviewers, Availability, Resumes, Real Auth ✅

### Completed
- [x] **Per-slot interviewer assignment (company portal)**
  - Interviewer roster CRUD at `/portal/interviewers`
  - Per-slot interviewer dropdown on `/portal/schedule` (auto-saves)
  - A lone interviewer is auto-assigned to every slot; multi-interviewer
    companies get a "Apply to all" bulk control
  - Interviewer name shown on the printable Schedule Review
- [x] **Attorney availability blocking + status (admin)**
  - Add/remove time-specific unavailability (whole-day or single-slot, with a
    note like "panel duty") via the per-attorney "Manage" dialog
  - Withdraw / reactivate attorneys; withdrawn are excluded from all selection
  - Roster status shows an "Unavailable (N)" popover listing the blocked times
  - Reusable availability-aware `AttorneyPicker` component for future slot pickers
- [x] **Resume integration (PDF only)**
  - Upload/replace/remove PDF per attorney (admin), strict `application/pdf` +
    `%PDF` magic-byte validation, 10 MB cap
  - Stored on a Railway Volume via `src/lib/storage.ts` (`RESUME_STORAGE_DIR`)
  - Served (auth-guarded) at `GET /api/attorneys/[id]/resume`
  - "View Resume" links in the admin roster and portal schedule/review
- [x] **Clerk auth re-enabled for real users**
  - `ClerkProvider`, `clerkMiddleware`, real `<SignIn>`/`<SignUp>` pages,
    `<UserButton>` in both layouts (password gate removed)
  - Admins = TMCP Clerk **Organization** members with the `org:admin` role
  - Companies = **invite-code claim** at `/portal` linking `companies.clerkUserId`
  - `getRole()`/`getCompanyId()` now resolve from Clerk (same signatures)

### Setup required before deploy
- [ ] Run `npx drizzle-kit push` to apply the additive schema changes
  (attorney resume columns; unique index on `companies.clerk_user_id`)
- [ ] Set `RESUME_STORAGE_DIR` and attach a **Railway Volume** mounted at `/data`
  (without a volume, uploaded PDFs are wiped on redeploy)
- [ ] In the Clerk dashboard: enable **Organizations**, create the TMCP org, and
  assign staff the `org:admin` role; set production Clerk keys in env
- [ ] Set `NEXT_PUBLIC_CLERK_SIGN_IN/UP_FALLBACK_REDIRECT_URL=/portal`

---

## Phase 2: Admin — Full Event & Data Management ✅

- [x] **Event CRUD** (`/admin/events` + per-event `Settings`)
  - Create events (name, dates, location, interview length, status)
  - Edit any field later; status: draft → open → closed
  - Danger Zone (typed-confirmation): clear all assignments, or delete the
    event and everything in it
- [x] **Days & time slots** (`/admin/events/[id]/days`)
  - Add/edit/delete event days (date, auto label, in-person/virtual, hours)
  - Breaks per day (e.g. lunch) — slots are never generated inside a break
  - One-click slot generation from the day's hours in `slotDuration` steps;
    **regenerate** any time after changing hours/breaks/interview length:
    missing slots are created, empty off-grid slots are removed, and slots
    with booked interviews are always kept (and reported)
  - One-off manual slots and per-slot delete (with booked-interview warning)
- [x] **Company management** — add/edit/delete companies, set status,
  regenerate invite codes, unlink a claimed portal account
- [x] **Attorney management** — add/edit/delete attorneys (plus the existing
  withdraw/availability/resume tools); per-attorney printable schedule at
  `/admin/events/[id]/attorneys/[attorneyId]/schedule` (for interviewees)
- [x] **Editable Master Schedule** (`/admin/events/[id]/assignments`)
  - Click any company × time cell to schedule, change, or remove an interview
  - Attorney picker with live filter; attorneys already booked in that slot
    are disabled; unavailability blocks show a warning (admin can override);
    withdrawn attorneys are excluded from selection but still display on
    their existing interviews
  - Friendly conflict errors backed by DB unique constraints; notes per
    interview; changes appear in company portals immediately
- [x] **Wipe seeded data** — `npx tsx scripts/wipe.ts --yes` (all events,
  cascading), or per-event via Settings → Danger Zone in the UI
- [x] **Local development without Clerk/Neon**
  - `DEV_AUTH=admin|company[:id]` env bypass (disabled in production builds)
  - `DATABASE_URL` pointing at any local Postgres uses the node-postgres
    driver automatically (Neon HTTP driver for `*.neon.tech` URLs)
  - Dev-only `/api/dev-harness` route used by the E2E test scenario
- [x] **Tested end-to-end locally** — 56-check admin scenario (event → days →
  breaks → slots → companies → attorneys → blocks → assignments → resume →
  destructive ops) plus the company-portal interviewer/schedule flows

## Phase 4: Export (Pending)
- [ ] PDF export of the master grid
- [ ] CSV/Excel export

## Phase 5: Polish & Deploy (Pending)
- [ ] Error handling
- [ ] Loading states
- [ ] Responsive design
- [ ] Production deployment

## Auth fix: email-free company login ✅

**Problem:** every login went through Clerk, which authenticates by emailing a
verification code. Those codes don't reach many corporate/legal mail servers
(e.g. texasbar.com), so companies/interviewees literally could not log in.

**Fix:** companies now sign in with the **invite code** TMCP issues them — no
email, no account. The code is verified server-side and an HMAC-signed,
httpOnly session cookie is set (`src/lib/session.ts`). Clerk is kept for TMCP
staff/admins only (their own email login already works).

- Company login at `/portal` (invite code) → signed `tmcp_company` cookie
- Landing page `/` is a chooser: Company/Interviewee vs TMCP Staff
- `getRole()`/`getCompanyId()` resolve from the cookie first, then fall back to
  a legacy Clerk-claimed company (backward compatible)
- Middleware no longer forces a Clerk sign-in on `/portal` or the resume route;
  those are gated in-app. Only `/admin` requires Clerk.
- Cookie is signed with `SESSION_SECRET` (falls back to `CLERK_SECRET_KEY`)
- Admin "Companies" page now shows "Signed in / Not signed in" (from status)
  instead of the old Clerk "Claimed" badge
