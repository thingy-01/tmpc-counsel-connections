import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { getDevAuth } from "@/lib/dev-auth";

export type UserRole = "admin" | "company" | null;

/** Clerk's built-in admin role key for organization members. */
export const ADMIN_ORG_ROLE = "org:admin";

/**
 * Resolve the current user's role from Clerk.
 * - Member of the TMCP organization with the admin role  => "admin"
 * - A company row claimed by this Clerk user             => "company"
 * - Otherwise (signed out, or signed in but unclaimed)   => null
 */
export async function getRole(): Promise<UserRole> {
  const dev = getDevAuth();
  if (dev) return dev.role;

  const { userId, orgRole } = await auth();
  if (!userId) return null;
  if (orgRole === ADMIN_ORG_ROLE) return "admin";

  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.clerkUserId, userId))
    .limit(1);
  return rows.length > 0 ? "company" : null;
}

/** The company id claimed by the current Clerk user, or null. */
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

  const { userId } = await auth();
  if (!userId) return null;

  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.clerkUserId, userId))
    .limit(1);
  return rows[0]?.id ?? null;
}
