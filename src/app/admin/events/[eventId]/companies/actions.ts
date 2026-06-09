"use server";

import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getRole } from "@/lib/auth";
import { constraintViolated } from "@/lib/db/errors";

export type ActionResult = { ok: boolean; error?: string };

async function requireAdmin(): Promise<void> {
  const role = await getRole();
  if (role !== "admin") throw new Error("Admin access required.");
}

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/companies`);
  revalidatePath(`/admin/events/${eventId}/assignments`);
  revalidatePath("/admin");
}

/** Same shape the seed script used: slugged name + 6 random chars. */
function generateInviteCode(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 30) +
    "-" +
    Math.random().toString(36).substring(2, 8)
  );
}

function parseCompanyFields(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Company name is required." };

  const staffRaw = (formData.get("legalStaffCount") as string)?.trim();
  const legalStaffCount = staffRaw ? parseInt(staffRaw, 10) : null;
  if (legalStaffCount !== null && !Number.isFinite(legalStaffCount)) {
    return { error: "Legal staff count must be a number." };
  }

  const need = (formData.get("outsideCounselNeed") as string) || null;
  const practiceAreasRaw = (formData.get("practiceAreas") as string) ?? "";
  const practiceAreas = practiceAreasRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    fields: {
      name,
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
    },
  };
}

export async function createCompany(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const parsed = parseCompanyFields(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  try {
    await db.insert(companies).values({
      eventId,
      ...parsed.fields!,
      inviteCode: generateInviteCode(parsed.fields!.name),
      status: "invited",
    });
  } catch (e) {
    if (constraintViolated(e, "companies_event_name_unique")) {
      return { ok: false, error: "A company with that name already exists for this event." };
    }
    throw e;
  }

  revalidate(eventId);
  return { ok: true };
}

export async function updateCompany(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const companyId = formData.get("companyId") as string;
  const parsed = parseCompanyFields(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  try {
    await db
      .update(companies)
      .set({ ...parsed.fields!, updatedAt: new Date() })
      .where(eq(companies.id, companyId));
  } catch (e) {
    if (constraintViolated(e, "companies_event_name_unique")) {
      return { ok: false, error: "A company with that name already exists for this event." };
    }
    throw e;
  }

  revalidate(eventId);
  return { ok: true };
}

/** Delete a company and (via cascades) its interviewers, selections, and assignments. */
export async function deleteCompany(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const companyId = formData.get("companyId") as string;
  await db.delete(companies).where(eq(companies.id, companyId));
  revalidate(eventId);
}

export async function setCompanyStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const companyId = formData.get("companyId") as string;
  const status = formData.get("status") as string;
  if (!["invited", "registered", "selections_complete"].includes(status)) {
    throw new Error("Invalid status.");
  }
  await db
    .update(companies)
    .set({ status, updatedAt: new Date() })
    .where(eq(companies.id, companyId));
  revalidate(eventId);
}

/** Issue a fresh invite code (e.g. if the old one leaked or was mistyped into the wrong hands). */
export async function regenerateInviteCode(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const companyId = formData.get("companyId") as string;
  const row = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { name: true },
  });
  if (!row) throw new Error("Company not found.");
  await db
    .update(companies)
    .set({ inviteCode: generateInviteCode(row.name), updatedAt: new Date() })
    .where(eq(companies.id, companyId));
  revalidate(eventId);
}

/** Detach the claimed portal account so a different user can claim the company. */
export async function unclaimCompany(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const companyId = formData.get("companyId") as string;
  await db
    .update(companies)
    .set({ clerkUserId: null, updatedAt: new Date() })
    .where(eq(companies.id, companyId));
  revalidate(eventId);
}
