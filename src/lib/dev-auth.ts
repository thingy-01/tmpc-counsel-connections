/**
 * Local-development auth bypass (never active in production builds).
 *
 * Set DEV_AUTH in .env.local to run the app without Clerk keys:
 *   DEV_AUTH=admin              act as a TMCP admin
 *   DEV_AUTH=company            act as the first company in the DB
 *   DEV_AUTH=company:<uuid>     act as a specific company
 *
 * When DEV_AUTH is set, Clerk middleware and <ClerkProvider> are skipped
 * entirely. NODE_ENV gating means a stray DEV_AUTH variable on Railway
 * (which runs production builds) has no effect.
 */
export type DevAuth =
  | { role: "admin" }
  | { role: "company"; companyId: string | null }
  | null;

export function getDevAuth(): DevAuth {
  if (process.env.NODE_ENV === "production") return null;
  const value = process.env.DEV_AUTH;
  if (!value) return null;
  if (value === "admin") return { role: "admin" };
  if (value === "company") return { role: "company", companyId: null };
  if (value.startsWith("company:")) {
    return { role: "company", companyId: value.slice("company:".length) };
  }
  return null;
}
