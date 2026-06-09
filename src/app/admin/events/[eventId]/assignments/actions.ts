"use server";

import { db } from "@/lib/db";
import { assignments, attorneys } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getRole } from "@/lib/auth";
import { constraintViolated } from "@/lib/db/errors";

export type ActionResult = { ok: boolean; error?: string };

async function requireAdmin(): Promise<void> {
  const role = await getRole();
  if (role !== "admin") throw new Error("Admin access required.");
}

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/assignments`);
  revalidatePath("/admin");
  // Companies see these on their portal schedule immediately.
  revalidatePath("/portal", "layout");
}

/**
 * Create or update an interview assignment for a company × time-slot cell.
 * Pass assignmentId to change an existing interview's attorney/notes.
 */
export async function saveAssignment(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const assignmentId = (formData.get("assignmentId") as string) || null;
  const companyId = formData.get("companyId") as string;
  const timeSlotId = formData.get("timeSlotId") as string;
  const attorneyId = formData.get("attorneyId") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!attorneyId) return { ok: false, error: "Pick an attorney." };

  const attorney = await db.query.attorneys.findFirst({
    where: eq(attorneys.id, attorneyId),
    columns: { status: true, firstName: true, lastName: true },
  });
  if (!attorney) return { ok: false, error: "Attorney not found." };
  if (attorney.status === "withdrawn") {
    return { ok: false, error: "That attorney has withdrawn from the event." };
  }

  // Friendly pre-check for the DB's attorney/slot unique constraint.
  const clash = await db
    .select({ id: assignments.id })
    .from(assignments)
    .where(
      and(
        eq(assignments.attorneyId, attorneyId),
        eq(assignments.timeSlotId, timeSlotId),
        assignmentId ? ne(assignments.id, assignmentId) : undefined
      )
    )
    .limit(1);
  if (clash.length > 0) {
    return {
      ok: false,
      error: `${attorney.firstName} ${attorney.lastName} already has an interview in this time slot.`,
    };
  }

  try {
    if (assignmentId) {
      await db
        .update(assignments)
        .set({ attorneyId, notes, updatedAt: new Date() })
        .where(eq(assignments.id, assignmentId));
    } else {
      await db.insert(assignments).values({
        companyId,
        timeSlotId,
        attorneyId,
        notes,
        source: "admin",
        status: "confirmed",
      });
    }
  } catch (e) {
    if (constraintViolated(e, "assignments_attorney_slot_unique")) {
      return { ok: false, error: "That attorney is already booked in this slot." };
    }
    if (constraintViolated(e, "assignments_company_slot_unique")) {
      return { ok: false, error: "This company already has an interview in this slot." };
    }
    throw e;
  }

  revalidate(eventId);
  return { ok: true };
}

export async function deleteAssignment(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const assignmentId = formData.get("assignmentId") as string;
  await db.delete(assignments).where(eq(assignments.id, assignmentId));
  revalidate(eventId);
  return { ok: true };
}
