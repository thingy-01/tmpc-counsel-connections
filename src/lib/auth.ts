import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { getDevAuth } from "@/lib/dev-auth";
import { getCompanySessionId } from "@/lib/session";

export type UserRole = "admin" | "company" | null;

/** Clerk's built-in admin role key for organization members. */
export const ADMIN_ORG_ROLE = "org:admin";

/**
 * Clerk's auth(), but never throws — returns nulls if Clerk isn't configured
 * or its middleware didn't run (e.g. the company portal, which uses an
 * email-free invite-code session instead of Clerk).
 */
async function safeClerkAuth(): Promise<{
  userId: string | null;
  orgRole: string | null;
}> {
  try {
    const { userId, orgRole } = await auth();
    return { userId: userId ?? null, orgRole: orgRole ?? null };
  } catch {
    return { userId: null, orgRole: null };
  }
}

/**
 * Is this Clerk user an admin in the TMCP organization?
 *
 * auth().orgRole only reflects the *active* organization, which Clerk may not
 * set when "membership is optional". So we check the user's full membership
 * list — a staff member is an admin no matter which org is active.
 */
export async function isClerkAdmin(userId: string): Promise<boolean> {
  try {
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({
      userId,
    });
    return memberships.data.some((m) => m.role === ADMIN_ORG_ROLE);
  } catch {
    return false;
  }
}

/**
 * Resolve the current user's role.
 * - TMCP Clerk organization member with the admin role  => "admin"
 * - A valid email-free company session (invite code)    => "company"
 * - A company row claimed by this Clerk user            => "company"
 * - Otherwise                                            => null
 */
export async function getRole(): Promise<UserRole> {
  const dev = getDevAuth();
  if (dev) return dev.role;

  const { userId, orgRole } = await safeClerkAuth();
  if (orgRole === ADMIN_ORG_ROLE) return "admin";
  // Fallback for when the TMCP org isn't the active org in this session.
  if (userId && (await isClerkAdmin(userId))) return "admin";

  const companyId = await getCompanyId();
  return companyId ? "company" : null;
}

/** The company id for the current portal user (email-free session or Clerk claim), or null. */
export async function getCompanyId(): Promise<string | null> {
  const dev = getDevAuth();
  if (dev) {
    if (dev.role !== "company") return null;
    if (dev.companyId) return dev.companyId;
    const first = await db
      .select({ id: companies.id })
      .from(companies)
      .orderBy(asc(companies.name))
      .limit(1);
    return first[0]?.id ?? null;
  }

  // Primary path: email-free invite-code session. Re-check the row still exists
  // (it could have been deleted by an admin) before trusting the cookie.
  const sessionId = await getCompanySessionId();
  if (sessionId) {
    const rows = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, sessionId))
      .limit(1);
    if (rows[0]) return rows[0].id;
  }

  // Backward-compatible path: a company previously claimed via a Clerk account.
  const { userId } = await safeClerkAuth();
  if (!userId) return null;
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.clerkUserId, userId))
    .limit(1);
  return rows[0]?.id ?? null;
}
