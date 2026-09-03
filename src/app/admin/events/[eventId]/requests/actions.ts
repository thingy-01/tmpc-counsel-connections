"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { attorneyRescheduleRequests } from "@/lib/db/schema";
import { getDevAuth } from "@/lib/dev-auth";
import {
  canTransitionRescheduleRequest,
  effectiveRescheduleStatus,
  isRescheduleStatus,
} from "@/lib/reschedule";

export type StaffRequestActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function staffActorId(): Promise<string> {
  if (getDevAuth()?.role === "admin") return "development-staff";
  const { userId } = await auth();
  if (!userId) throw new Error("Authenticated staff identity required.");
  return userId;
}

export async function transitionStaffRequest(
  _previous: StaffRequestActionResult,
  formData: FormData
): Promise<StaffRequestActionResult> {
  if ((await getRole()) !== "admin") {
    return { ok: false, error: "Admin access required." };
  }
  const eventId = formData.get("eventId");
  const requestId = formData.get("requestId");
  const desired = formData.get("status");
  if (
    typeof eventId !== "string" ||
    !UUID_PATTERN.test(eventId) ||
    typeof requestId !== "string" ||
    !UUID_PATTERN.test(requestId) ||
    typeof desired !== "string" ||
    !isRescheduleStatus(desired)
  ) {
    return { ok: false, error: "The submitted request is invalid." };
  }

  const staffNoteValue = formData.get("staffNote");
  const staffNote =
    typeof staffNoteValue === "string" ? staffNoteValue.trim() : "";
  if (staffNote.length > 4000) {
    return { ok: false, error: "Keep the staff note to 4,000 characters or fewer." };
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
  if (!canTransitionRescheduleRequest("staff", current, desired)) {
    return {
      ok: false,
      error: `A staff member cannot change ${current} to ${desired}.`,
    };
  }
  if (desired === "resolved_rescheduled") {
    return {
      ok: false,
      error: "Choose a new slot and use Resolve by rescheduling.",
    };
  }

  const actorId = await staffActorId();
  const result = await db.execute<{ id: string }>(sql`
    update attorney_reschedule_requests request
    set status = ${desired},
        staff_note = ${staffNote || null},
        resolved_by = case
          when ${desired} = 'resolved_declined' then ${actorId}
          else null
        end,
        resolved_at = case
          when ${desired} = 'resolved_declined' then now()
          else null
        end,
        updated_at = now()
    where request.id = cast(${requestId} as uuid)
      and request.event_id = cast(${eventId} as uuid)
      and request.status = ${current}
      and request.assignment_id is not null
    returning request.id
  `);
  if (result.rows.length !== 1) {
    return { ok: false, error: "That request changed before it could be updated." };
  }

  revalidatePath(`/admin/events/${eventId}/requests`);
  revalidatePath("/attorney/requests");
  return { ok: true, message: "The request was updated." };
}
