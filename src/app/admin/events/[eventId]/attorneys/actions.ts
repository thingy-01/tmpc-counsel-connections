"use server";

import { db } from "@/lib/db";
import { attorneys, attorneyUnavailability } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getRole } from "@/lib/auth";
import { constraintViolated } from "@/lib/db/errors";
import { saveResume, deleteResume, resumeRelativePath } from "@/lib/storage";
import {
  ORGANIZATION_TYPES,
  PRACTICE_AREAS,
  parsePracticeAreas,
  practiceAreaEntriesEqual,
  serializePracticeAreas,
  type PracticeAreaEntry,
} from "@/lib/practice-areas";

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

type ExistingTaxonomy = {
  organizationType: string | null;
  practiceAreas: unknown;
};

function parseAttorneyFields(
  formData: FormData,
  existing?: ExistingTaxonomy
) {
  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const firm = (formData.get("firm") as string)?.trim();
  if (!firstName || !lastName) return { error: "First and last name are required." };
  if (!email) return { error: "Email is required." };
  if (!firm) return { error: "Firm is required." };

  const submittedOrganizationType = String(
    formData.get("organizationType") ?? ""
  );
  const organizationType =
    submittedOrganizationType === existing?.organizationType
      ? submittedOrganizationType
      : submittedOrganizationType.trim();
  const canonicalOrganizationTypes = ORGANIZATION_TYPES as readonly string[];
  if (
    organizationType &&
    !canonicalOrganizationTypes.includes(organizationType) &&
    organizationType !== existing?.organizationType
  ) {
    return {
      error:
        "Choose a listed organization type. An imported legacy value may only be preserved unchanged.",
    };
  }

  const areas = formData.getAll("practiceArea").map(String);
  const percentages = formData.getAll("practicePercent").map((value) =>
    String(value).trim()
  );
  const existingPracticeAreas = parsePracticeAreas(
    existing?.practiceAreas
  ).entries;
  const existingAreas = new Set(existingPracticeAreas.map((entry) => entry.area));
  const canonicalAreas = PRACTICE_AREAS as readonly string[];
  const practiceAreas: PracticeAreaEntry[] = [];

  for (const [index, area] of areas.entries()) {
    const percentText = percentages[index] ?? "";
    if (!area.trim()) {
      if (percentText) return { error: "Choose a practice area for each percentage." };
      continue;
    }
    if (!canonicalAreas.includes(area) && !existingAreas.has(area)) {
      return {
        error:
          "Choose listed practice areas. An imported legacy label may only be preserved unchanged.",
      };
    }
    if (!percentText) {
      practiceAreas.push({ area });
      continue;
    }
    const percent = Number(percentText);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return { error: "Practice-area percentages must be numbers from 0 to 100." };
    }
    practiceAreas.push({ area, percent });
  }

  const practiceAreasUnchanged =
    Boolean(existing) &&
    practiceAreaEntriesEqual(practiceAreas, existingPracticeAreas);

  if (!practiceAreasUnchanged && practiceAreas.some((entry) => entry.percent === undefined)) {
    return {
      error:
        "Supply a percentage for each practice area. Percentages in a newly submitted edit must total 100%.",
    };
  }
  if (!practiceAreasUnchanged && practiceAreas.length > 2) {
    return {
      error:
        "A newly submitted edit may contain at most two practice areas. Remove extra imported areas before saving.",
    };
  }
  if (
    !practiceAreasUnchanged &&
    new Set(practiceAreas.map((entry) => entry.area.toLocaleLowerCase("en-US")))
      .size !== practiceAreas.length
  ) {
    return { error: "Choose each practice area only once." };
  }
  const percentageTotal = practiceAreas.reduce(
    (total, entry) => total + (entry.percent ?? 0),
    0
  );
  if (
    !practiceAreasUnchanged &&
    practiceAreas.length > 0 &&
    Math.abs(percentageTotal - 100) > 0.000001
  ) {
    return {
      error:
        "Practice-area percentages in a newly submitted edit must total 100%.",
    };
  }

  return {
    fields: {
      firstName,
      lastName,
      email,
      firm,
      phone: (formData.get("phone") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      organizationType: organizationType || null,
      ...(practiceAreasUnchanged
        ? {}
        : { practiceAreas: serializePracticeAreas(practiceAreas) }),
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
  const existing = await db.query.attorneys.findFirst({
    where: and(eq(attorneys.id, attorneyId), eq(attorneys.eventId, eventId)),
    columns: { organizationType: true, practiceAreas: true },
  });
  if (!existing) return { ok: false, error: "Attorney not found." };

  const parsed = parseAttorneyFields(formData, existing);
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

export async function addUnavailability(
  _prevOrFormData: ActionResult | FormData,
  submittedFormData?: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const formData = submittedFormData ?? (_prevOrFormData as FormData);
  const eventId = formData.get("eventId") as string;
  const attorneyId = formData.get("attorneyId") as string;
  const scope = formData.get("scope") as string; // "day" | "slot"
  const note = (formData.get("note") as string)?.trim() || null;

  if (!eventId || !attorneyId) {
    return { ok: false, error: "The attorney or event is no longer available." };
  }

  let availabilityValues:
    | { attorneyId: string; eventDayId: string }
    | { attorneyId: string; timeSlotId: string };
  if (scope === "day") {
    const eventDayId = formData.get("eventDayId") as string;
    if (!eventDayId) return { ok: false, error: "Pick a day to block." };
    availabilityValues = { attorneyId, eventDayId };
  } else if (scope === "slot") {
    const timeSlotId = formData.get("timeSlotId") as string;
    if (!timeSlotId) return { ok: false, error: "Pick a time slot to block." };
    availabilityValues = { attorneyId, timeSlotId };
  } else {
    return { ok: false, error: "Choose a valid availability-block type." };
  }

  try {
    await db
      .insert(attorneyUnavailability)
      .values({ ...availabilityValues, note });
  } catch (error) {
    console.error("Failed to add attorney unavailability", error);
    return {
      ok: false,
      error: "Could not add that availability block. Refresh and try again.",
    };
  }

  try {
    await recomputeIsUnavailable(attorneyId);
  } catch (error) {
    console.error("Failed to refresh attorney availability status", error);
    revalidateAttorneys(eventId);
    return {
      ok: false,
      error:
        "The block was saved, but the availability status could not be refreshed.",
    };
  }

  revalidateAttorneys(eventId);
  return { ok: true };
}

export async function removeUnavailability(
  _prevOrFormData: ActionResult | FormData,
  submittedFormData?: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const formData =
    submittedFormData ?? (_prevOrFormData as FormData);
  const eventId = formData.get("eventId") as string;
  const id = formData.get("id") as string;
  const attorneyId = formData.get("attorneyId") as string;

  if (!eventId || !id || !attorneyId) {
    return { ok: false, error: "That availability block is no longer available." };
  }

  try {
    await db
      .delete(attorneyUnavailability)
      .where(
        and(
          eq(attorneyUnavailability.id, id),
          eq(attorneyUnavailability.attorneyId, attorneyId)
        )
      );
  } catch (error) {
    console.error("Failed to remove attorney unavailability", error);
    return {
      ok: false,
      error: "Could not remove that availability block. Refresh and try again.",
    };
  }

  try {
    await recomputeIsUnavailable(attorneyId);
  } catch (error) {
    console.error("Failed to refresh attorney availability status", error);
    revalidateAttorneys(eventId);
    return {
      ok: false,
      error:
        "The block was removed, but the availability status could not be refreshed.",
    };
  }

  revalidateAttorneys(eventId);
  return { ok: true };
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
