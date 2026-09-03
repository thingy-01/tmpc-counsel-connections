"use server";

import { db } from "@/lib/db";
import {
  assignments,
  attorneys,
  attorneyRescheduleRequests,
} from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getRole } from "@/lib/auth";
import { constraintViolated } from "@/lib/db/errors";
import {
  canTransitionRescheduleRequest,
  atomicRescheduleStatement,
  effectiveRescheduleStatus,
  isRescheduleStatus,
} from "@/lib/reschedule";
import { auth } from "@clerk/nextjs/server";
import { getDevAuth } from "@/lib/dev-auth";

export type ActionResult = { ok: boolean; error?: string };

async function requireAdmin(): Promise<void> {
  const role = await getRole();
  if (role !== "admin") throw new Error("Admin access required.");
}

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/assignments`);
  revalidatePath("/admin");
  // Companies see these on their portal schedule immediately.
  revalidatePath("/portal/schedule");
  revalidatePath("/portal/schedule/review");
  revalidatePath("/attorney/schedule");
  revalidatePath("/attorney/requests");
  revalidatePath(`/admin/events/${eventId}/requests`);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function staffActorId(): Promise<string> {
  if (getDevAuth()?.role === "admin") return "development-staff";
  const { userId } = await auth();
  if (!userId) throw new Error("Authenticated staff identity required.");
  return userId;
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

/** Atomically move a booking and close its active reschedule request. */
export async function resolveRequestByMoving(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId");
  const requestId = formData.get("requestId");
  const newSlotId = formData.get("newSlotId");
  if (
    typeof eventId !== "string" ||
    !UUID_PATTERN.test(eventId) ||
    typeof requestId !== "string" ||
    !UUID_PATTERN.test(requestId) ||
    typeof newSlotId !== "string" ||
    !UUID_PATTERN.test(newSlotId)
  ) {
    return { ok: false, error: "The request or new time slot is invalid." };
  }

  const rows = await db
    .select({
      status: attorneyRescheduleRequests.status,
      assignmentId: attorneyRescheduleRequests.assignmentId,
    })
    .from(attorneyRescheduleRequests)
    .where(
      and(
        eq(attorneyRescheduleRequests.id, requestId),
        eq(attorneyRescheduleRequests.eventId, eventId)
      )
    )
    .limit(1);
  const request = rows[0];
  if (!request || !isRescheduleStatus(request.status)) {
    return { ok: false, error: "That request was not found in this event." };
  }
  const current = effectiveRescheduleStatus(request.status, request.assignmentId);
  if (
    !canTransitionRescheduleRequest(
      "staff",
      current,
      "resolved_rescheduled"
    )
  ) {
    return { ok: false, error: "That request can no longer be rescheduled." };
  }

  const actorId = await staffActorId();
  try {
    const result = await db.execute<{
      moved: string | number;
      resolved: string | number;
    }>(
      atomicRescheduleStatement({
        eventId,
        requestId,
        newSlotId,
        actorId,
      })
    );
    const counts = result.rows[0];
    if (Number(counts?.moved) !== 1 || Number(counts?.resolved) !== 1) {
      return {
        ok: false,
        error:
          "Nothing changed. Choose a different same-event slot that is available for this attorney.",
      };
    }
  } catch (error) {
    if (constraintViolated(error, "assignments_attorney_slot_unique")) {
      return {
        ok: false,
        error: "That attorney was just booked for this time. Choose another slot.",
      };
    }
    if (constraintViolated(error, "assignments_company_slot_unique")) {
      return {
        ok: false,
        error: "That company already has an interview in this time slot.",
      };
    }
    throw error;
  }

  revalidate(eventId);
  return { ok: true };
}
