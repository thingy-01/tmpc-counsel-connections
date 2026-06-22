"use server";

import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCompanyId } from "@/lib/auth";

export type ProfileResult = { ok: boolean; error?: string };

/**
 * A company editing its OWN profile. Scoped to the logged-in company's id from
 * the session — the form can't target another company. The name is fixed by
 * the admin, so it isn't editable here.
 */
export async function updateMyCompany(
  _prev: ProfileResult,
  formData: FormData
): Promise<ProfileResult> {
  const companyId = await getCompanyId();
  if (!companyId) return { ok: false, error: "Your session expired. Sign in again." };

  const staffRaw = (formData.get("legalStaffCount") as string)?.trim();
  const legalStaffCount = staffRaw ? parseInt(staffRaw, 10) : null;
  if (legalStaffCount !== null && !Number.isFinite(legalStaffCount)) {
    return { ok: false, error: "Legal staff count must be a number." };
  }

  const need = (formData.get("outsideCounselNeed") as string) || "";
  const practiceAreas = ((formData.get("practiceAreas") as string) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await db
    .update(companies)
    .set({
      website: (formData.get("website") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      state: (formData.get("state") as string)?.trim() || null,
      description: (formData.get("description") as string)?.trim() || null,
      legalStaffCount,
      outsideCounselNeed: need === "" ? null : need,
      practiceAreas,
      contactName: (formData.get("contactName") as string)?.trim() || null,
      contactTitle: (formData.get("contactTitle") as string)?.trim() || null,
      contactEmail: (formData.get("contactEmail") as string)?.trim() || null,
      contactPhone: (formData.get("contactPhone") as string)?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));

  // Reflect the change in the company portal and the admin company list.
  revalidatePath("/portal", "layout");
  revalidatePath("/admin", "layout");
  return { ok: true };
}
