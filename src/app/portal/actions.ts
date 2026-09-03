"use server";

import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { setCompanySession, clearCompanySession } from "@/lib/session";
import { isCompanyProfileComplete } from "@/lib/company-profile";

export type LoginResult = { ok: boolean; error?: string };

/**
 * Email-free company login. The company enters the invite code TMCP issued
 * them; we verify it and set a signed session cookie. No email, no Clerk
 * account — interview participants just need their code.
 */
export async function loginCompany(
  _prev: LoginResult,
  formData: FormData
): Promise<LoginResult> {
  const code = (formData.get("inviteCode") as string)?.trim();
  if (!code) return { ok: false, error: "Enter your invite code." };

  const rows = await db
    .select({
      id: companies.id,
      status: companies.status,
      contactName: companies.contactName,
      contactEmail: companies.contactEmail,
    })
    .from(companies)
    .where(eq(companies.inviteCode, code))
    .limit(1);

  const company = rows[0];
  if (!company) return { ok: false, error: "That invite code is not valid." };

  await setCompanySession(company.id);

  // First successful login moves the company from "invited" to "registered".
  if (company.status === "invited") {
    await db
      .update(companies)
      .set({ status: "registered", updatedAt: new Date() })
      .where(eq(companies.id, company.id));
  }

  redirect(
    isCompanyProfileComplete(company)
      ? "/portal/schedule"
      : "/portal/profile"
  );
}

export async function logoutCompany(): Promise<void> {
  await clearCompanySession();
  redirect("/");
}
