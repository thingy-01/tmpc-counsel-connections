"use server";

import { db } from "@/lib/db";
import { attorneys, attorneyUnavailability } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getRole } from "@/lib/auth";
import { saveResume, deleteResume, resumeRelativePath } from "@/lib/storage";

const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MB

async function requireAdmin(): Promise<void> {
  const role = await getRole();
  if (role !== "admin") throw new Error("Admin access required.");
}

function revalidateAttorneys(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/attorneys`);
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
