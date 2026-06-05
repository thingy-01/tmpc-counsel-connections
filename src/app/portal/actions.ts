"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type ClaimResult = { ok: boolean; error?: string };

/**
 * Link the signed-in Clerk user to a company via its invite code.
 * Sets companies.clerkUserId and flips status to "registered".
 */
export async function claimCompany(
  _prev: ClaimResult,
  formData: FormData
): Promise<ClaimResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please sign in first." };

  const code = (formData.get("inviteCode") as string)?.trim();
  if (!code) return { ok: false, error: "Enter your invite code." };

  const rows = await db
    .select({ id: companies.id, clerkUserId: companies.clerkUserId })
    .from(companies)
    .where(eq(companies.inviteCode, code))
    .limit(1);

  const company = rows[0];
  if (!company) return { ok: false, error: "That invite code is not valid." };
  if (company.clerkUserId && company.clerkUserId !== userId) {
    return { ok: false, error: "This company has already been claimed." };
  }

  await db
    .update(companies)
    .set({ clerkUserId: userId, status: "registered", updatedAt: new Date() })
    .where(eq(companies.id, company.id));

  revalidatePath("/portal", "layout");
  return { ok: true };
}
