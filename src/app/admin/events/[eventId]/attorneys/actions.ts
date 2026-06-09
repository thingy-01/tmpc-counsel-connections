"use server";

import { db } from "@/lib/db";
import { attorneys, attorneyUnavailability } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getRole } from "@/lib/auth";
import { constraintViolated } from "@/lib/db/errors";
import { saveResume, deleteResume, resumeRelativePath } from "@/lib/storage";

const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MB

export type ActionResult = { ok: boolean; error?: string };

async function requireAdmin(): Promise<void> {
  const role = await getRole();
  if (role !== "admin") throw new Error("Admin access required.");
}

function revalidateAttorneys(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/attorneys`);
  revalidatePath(`/admin/events/${eventId}/assignments`);
  revalidatePath("/admin");
}

function parseAttorneyFields(formData: FormData) {
  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const firm = (formData.get("firm") as string)?.trim();
  if (!firstName || !lastName) return { error: "First and last name are required." };
  if (!email) return { error: "Email is required." };
  if (!firm) return { error: "Firm is required." };

  const practiceAreasRaw = (formData.get("practiceAreas") as string) ?? "";
  const practiceAreas = practiceAreasRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    fields: {
      firstName,
      lastName,
      email,
      firm,
      phone: (formData.get("phone") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      organizationType: (formData.get("organizationType") as string)?.trim() || null,
      practiceAreas,
    },
  };
}

export async function addAttorney(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const parsed = parseAttorneyFields(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  try {
    await db.insert(attorneys).values({ eventId, ...parsed.fields! });
  } catch (e) {
    if (constraintViolated(e, "attorneys_event_email_unique")) {
      return { ok: false, error: "An attorney with that email is already registered." };
    }
    throw e;
  }

  revalidateAttorneys(eventId);
  return { ok: true };
}

export async function updateAttorney(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const attorneyId = formData.get("attorneyId") as string;
  const parsed = parseAttorneyFields(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  try {
    await db
      .update(attorneys)
      .set({ ...parsed.fields!, updatedAt: new Date() })
      .where(eq(attorneys.id, attorneyId));
  } catch (e) {
    if (constraintViolated(e, "attorneys_event_email_unique")) {
      return { ok: false, error: "An attorney with that email is already registered." };
    }
    throw e;
  }

  revalidateAttorneys(eventId);
  return { ok: true };
}

/** Delete an attorney and (via cascades) their assignments and availability blocks. */
export async function deleteAttorney(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const attorneyId = formData.get("attorneyId") as string;
  await deleteResume(resumeRelativePath(attorneyId));
  await db.delete(attorneys).where(eq(attorneys.id, attorneyId));
  revalidateAttorneys(eventId);
}

/** Keep the denormalized attorneys.isUnavailable flag in sync with block rows. */
async function recomputeIsUnavailable(attorneyId: string): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attorneyUnavailability)
    .where(eq(attorneyUnavailability.attorneyId, attorneyId));
  await db
    .update(attorneys)
    .set({ isUnavailable: count > 0, updatedAt: new Date() })
    .where(eq(attorneys.id, attorneyId));
}

export async function addUnavailability(formData: FormData) {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const attorneyId = formData.get("attorneyId") as string;
  const scope = formData.get("scope") as string; // "day" | "slot"
  const note = (formData.get("note") as string)?.trim() || null;

  if (scope === "day") {
    const eventDayId = formData.get("eventDayId") as string;
    if (!eventDayId) throw new Error("Pick a day to block.");
    await db.insert(attorneyUnavailability).values({ attorneyId, eventDayId, note });
  } else {
    const timeSlotId = formData.get("timeSlotId") as string;
    if (!timeSlotId) throw new Error("Pick a time slot to block.");
    await db.insert(attorneyUnavailability).values({ attorneyId, timeSlotId, note });
  }

  await recomputeIsUnavailable(attorneyId);
  revalidateAttorneys(eventId);
}

export async function removeUnavailability(formData: FormData) {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const id = formData.get("id") as string;
  const attorneyId = formData.get("attorneyId") as string;

  await db
    .delete(attorneyUnavailability)
    .where(
      and(
        eq(attorneyUnavailability.id, id),
        eq(attorneyUnavailability.attorneyId, attorneyId)
      )
    );

  await recomputeIsUnavailable(attorneyId);
  revalidateAttorneys(eventId);
}

export async function withdrawAttorney(formData: FormData) {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const attorneyId = formData.get("attorneyId") as string;
  await db
    .update(attorneys)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(eq(attorneys.id, attorneyId));
  revalidateAttorneys(eventId);
}

export async function reactivateAttorney(formData: FormData) {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const attorneyId = formData.get("attorneyId") as string;
  await db
    .update(attorneys)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(attorneys.id, attorneyId));
  revalidateAttorneys(eventId);
}

export async function uploadResume(formData: FormData) {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const attorneyId = formData.get("attorneyId") as string;
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) throw new Error("Choose a PDF file to upload.");
  if (file.size > MAX_RESUME_BYTES) throw new Error("Resume must be 10 MB or smaller.");

  const bytes = Buffer.from(await file.arrayBuffer());

  // Validate it is really a PDF: declared type AND %PDF magic bytes.
  const isPdfType = file.type === "application/pdf";
  const hasPdfMagic = bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!isPdfType || !hasPdfMagic) {
    throw new Error("Only PDF files are accepted.");
  }

  const path = await saveResume(attorneyId, bytes);
  await db
    .update(attorneys)
    .set({
      resumePath: path,
      resumeOriginalName: file.name,
      resumeSize: file.size,
      resumeUploadedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(attorneys.id, attorneyId));

  revalidateAttorneys(eventId);
}

export async function removeResume(formData: FormData) {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const attorneyId = formData.get("attorneyId") as string;

  await deleteResume(resumeRelativePath(attorneyId));
  await db
    .update(attorneys)
    .set({
      resumePath: null,
      resumeOriginalName: null,
      resumeSize: null,
      resumeUploadedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(attorneys.id, attorneyId));

  revalidateAttorneys(eventId);
}
