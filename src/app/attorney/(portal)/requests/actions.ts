"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getAttorneyIdentity } from "@/lib/auth";
import { db } from "@/lib/db";
import { constraintViolated } from "@/lib/db/errors";
import { attorneyRescheduleRequests } from "@/lib/db/schema";
import {
  canTransitionRescheduleRequest,
  effectiveRescheduleStatus,
  isRescheduleStatus,
} from "@/lib/reschedule";

export type AttorneyRequestActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
  existingRequestId?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function refreshAttorneyRequests(eventId: string): void {
  revalidatePath("/attorney/schedule");
  revalidatePath("/attorney/requests");
  revalidatePath(`/admin/events/${eventId}/requests`);
}

export async function submitRescheduleRequest(
  _previous: AttorneyRequestActionResult,
  formData: FormData
): Promise<AttorneyRequestActionResult> {
  const identity = await getAttorneyIdentity();
  if (!identity) return { ok: false, error: "Your attorney session has expired." };

  const assignmentId = uuidField(formData, "assignmentId");
  if (!assignmentId) return { ok: false, error: "That interview is invalid." };

  const reasonValue = formData.get("reason");
  const reason = typeof reasonValue === "string" ? reasonValue.trim() : "";
  if (!reason) return { ok: false, error: "Tell staff why you need a change." };
  if (reason.length > 2000) {
    return { ok: false, error: "Keep the reason to 2,000 characters or fewer." };
  }

  const submittedAlternatives = formData.getAll("preferredSlotId");
  const validAlternatives = submittedAlternatives.filter(
    (value): value is string =>
      typeof value === "string" && UUID_PATTERN.test(value)
  );
  if (validAlternatives.length !== submittedAlternatives.length) {
    return { ok: false, error: "One of the preferred time slots is invalid." };
  }
  const alternatives = Array.from(new Set(validAlternatives));
  if (alternatives.length > 10) {
    return { ok: false, error: "Choose no more than 10 preferred time slots." };
  }

  try {
    const result = await db.execute<{ id: string }>(sql`
      with submitted_slots as (
        select value::uuid as id
        from jsonb_array_elements_text(${JSON.stringify(alternatives)}::jsonb)
      ), preferred as (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'timeSlotId', slot.id,
              'dayDate', day.date,
              'dayLabel', day.label,
              'startTime', slot.start_time,
              'endTime', slot.end_time
            ) order by day.date, slot.sort_order
          ),
          '[]'::jsonb
        ) as items,
        count(slot.id)::int as matched
        from submitted_slots submitted
        join time_slots slot on slot.id = submitted.id
        join event_days day on day.id = slot.event_day_id
        where day.event_id = cast(${identity.eventId} as uuid)
      ), booking as (
        select assignment.id,
               company.name as company_name,
               day.date as day_date,
               day.label as day_label,
               slot.start_time,
               slot.end_time
        from assignments assignment
        join attorneys attorney on attorney.id = assignment.attorney_id
        join companies company on company.id = assignment.company_id
        join time_slots slot on slot.id = assignment.time_slot_id
        join event_days day on day.id = slot.event_day_id
        where assignment.id = cast(${assignmentId} as uuid)
          and assignment.attorney_id = cast(${identity.attorneyId} as uuid)
          and assignment.status = 'confirmed'
          and attorney.event_id = cast(${identity.eventId} as uuid)
          and attorney.status <> 'withdrawn'
          and company.event_id = cast(${identity.eventId} as uuid)
          and day.event_id = cast(${identity.eventId} as uuid)
      )
      insert into attorney_reschedule_requests (
        assignment_id,
        attorney_id,
        event_id,
        reason,
        preferred_alternatives,
        snapshot,
        status
      )
      select booking.id,
             cast(${identity.attorneyId} as uuid),
             cast(${identity.eventId} as uuid),
             ${reason},
             preferred.items,
             jsonb_build_object(
               'companyName', booking.company_name,
               'dayDate', booking.day_date,
               'dayLabel', booking.day_label,
               'startTime', booking.start_time,
               'endTime', booking.end_time
             ),
             'open'
      from booking, preferred
      where preferred.matched = ${alternatives.length}
      returning id
    `);

    if (result.rows.length !== 1) {
      return {
        ok: false,
        error:
          "That interview is unavailable for requests, or your enrollment has been withdrawn.",
      };
    }
  } catch (error) {
    if (
      constraintViolated(
        error,
        "attorney_reschedule_requests_active_unique"
      )
    ) {
      const existing = await db
        .select({ id: attorneyRescheduleRequests.id })
        .from(attorneyRescheduleRequests)
        .where(
          and(
            eq(attorneyRescheduleRequests.assignmentId, assignmentId),
            eq(attorneyRescheduleRequests.attorneyId, identity.attorneyId),
            eq(attorneyRescheduleRequests.eventId, identity.eventId),
            sql`${attorneyRescheduleRequests.status} in ('open', 'in_review')`
          )
        )
        .limit(1);
      refreshAttorneyRequests(identity.eventId);
      return {
        ok: false,
        error: "You already have a request pending for this interview.",
        existingRequestId: existing[0]?.id,
      };
    }
    throw error;
  }

  refreshAttorneyRequests(identity.eventId);
  return { ok: true, message: "Your request was sent to staff for review." };
}

export async function withdrawRescheduleRequest(
  _previous: AttorneyRequestActionResult,
  formData: FormData
): Promise<AttorneyRequestActionResult> {
  const identity = await getAttorneyIdentity();
  if (!identity) return { ok: false, error: "Your attorney session has expired." };
  const requestId = uuidField(formData, "requestId");
  if (!requestId) return { ok: false, error: "That request is invalid." };

  const rows = await db
    .select({
      status: attorneyRescheduleRequests.status,
      assignmentId: attorneyRescheduleRequests.assignmentId,
    })
    .from(attorneyRescheduleRequests)
    .where(
      and(
        eq(attorneyRescheduleRequests.id, requestId),
        eq(attorneyRescheduleRequests.attorneyId, identity.attorneyId),
        eq(attorneyRescheduleRequests.eventId, identity.eventId)
      )
    )
    .limit(1);
  const request = rows[0];
  if (!request || !isRescheduleStatus(request.status)) {
    return { ok: false, error: "That request was not found." };
  }
  const current = effectiveRescheduleStatus(request.status, request.assignmentId);
  if (!canTransitionRescheduleRequest("attorney", current, "withdrawn")) {
    return { ok: false, error: "That request can no longer be withdrawn." };
  }

  const result = await db.execute<{ id: string }>(sql`
    update attorney_reschedule_requests request
    set status = 'withdrawn', updated_at = now()
    where request.id = cast(${requestId} as uuid)
      and request.attorney_id = cast(${identity.attorneyId} as uuid)
      and request.event_id = cast(${identity.eventId} as uuid)
      and request.status = ${current}
      and request.assignment_id is not null
      and exists (
        select 1 from attorneys attorney
        where attorney.id = request.attorney_id
          and attorney.event_id = request.event_id
          and attorney.status <> 'withdrawn'
      )
    returning request.id
  `);
  if (result.rows.length !== 1) {
    return {
      ok: false,
      error: "That request changed or your enrollment is no longer active.",
    };
  }

  refreshAttorneyRequests(identity.eventId);
  return { ok: true, message: "Your request was withdrawn." };
}
