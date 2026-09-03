import { sql } from "drizzle-orm";

export const RESCHEDULE_STATUSES = [
  "open",
  "in_review",
  "resolved_declined",
  "resolved_rescheduled",
  "withdrawn",
  "superseded",
] as const;

export type RescheduleStatus = (typeof RESCHEDULE_STATUSES)[number];
export type RescheduleActor = "staff" | "attorney" | "system";

const STAFF_TRANSITIONS: Readonly<Record<RescheduleStatus, readonly RescheduleStatus[]>> = {
  open: ["in_review", "resolved_declined", "resolved_rescheduled"],
  in_review: ["open", "resolved_declined", "resolved_rescheduled"],
  resolved_declined: [],
  resolved_rescheduled: [],
  withdrawn: [],
  superseded: [],
};

/** Pure status-and-actor guard shared by every reschedule status mutation. */
export function canTransitionRescheduleRequest(
  actor: RescheduleActor,
  from: RescheduleStatus,
  to: RescheduleStatus
): boolean {
  if (actor === "staff") return STAFF_TRANSITIONS[from].includes(to);
  if (actor === "attorney") {
    return (from === "open" || from === "in_review") && to === "withdrawn";
  }
  return (from === "open" || from === "in_review") && to === "superseded";
}

export function effectiveRescheduleStatus(
  storedStatus: RescheduleStatus,
  assignmentId: string | null
): RescheduleStatus {
  return assignmentId === null &&
    (storedStatus === "open" || storedStatus === "in_review")
    ? "superseded"
    : storedStatus;
}

export function isRescheduleStatus(value: string): value is RescheduleStatus {
  return (RESCHEDULE_STATUSES as readonly string[]).includes(value);
}

/**
 * One statement for the only two-row mutation in this workflow. Locking the
 * request and assignment in target makes a concurrent terminal transition
 * exclude the target before moved runs. resolved depends on moved, while a
 * unique-constraint error aborts the statement in full.
 */
export function atomicRescheduleStatement(input: {
  eventId: string;
  requestId: string;
  newSlotId: string;
  actorId: string;
}) {
  return sql`
    with target as materialized (
      select request.id as request_id, assignment.id as assignment_id
      from attorney_reschedule_requests request
      join assignments assignment on assignment.id = request.assignment_id
      join attorneys attorney on attorney.id = assignment.attorney_id
      join companies company on company.id = assignment.company_id
      join time_slots old_slot on old_slot.id = assignment.time_slot_id
      join event_days old_day on old_day.id = old_slot.event_day_id
      where request.id = cast(${input.requestId} as uuid)
        and request.event_id = cast(${input.eventId} as uuid)
        and request.status in ('open', 'in_review')
        and attorney.event_id = request.event_id
        and company.event_id = request.event_id
        and old_day.event_id = request.event_id
      for update of request, assignment
    ), moved as (
      update assignments assignment
      set time_slot_id = cast(${input.newSlotId} as uuid), updated_at = now()
      from target
      where assignment.id = target.assignment_id
        and assignment.status = 'confirmed'
        and assignment.time_slot_id <> cast(${input.newSlotId} as uuid)
        and exists (
          select 1
          from time_slots slot
          join event_days day on day.id = slot.event_day_id
          where slot.id = cast(${input.newSlotId} as uuid)
            and day.event_id = cast(${input.eventId} as uuid)
        )
        and not exists (
          select 1
          from attorney_unavailability unavailable
          where unavailable.attorney_id = assignment.attorney_id
            and (
              unavailable.time_slot_id = cast(${input.newSlotId} as uuid)
              or unavailable.event_day_id = (
                select slot.event_day_id
                from time_slots slot
                where slot.id = cast(${input.newSlotId} as uuid)
              )
            )
        )
      returning assignment.id
    ), resolved as (
      update attorney_reschedule_requests request
      set status = 'resolved_rescheduled',
          resolution_assignment_id = moved.id,
          resolved_by = ${input.actorId},
          resolved_at = now(),
          updated_at = now()
      from target, moved
      where request.id = target.request_id
        and request.assignment_id = moved.id
        and request.status in ('open', 'in_review')
      returning request.id
    )
    select (select count(*) from moved) as moved,
           (select count(*) from resolved) as resolved
  `;
}
