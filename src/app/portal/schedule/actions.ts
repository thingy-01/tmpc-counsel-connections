"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCompanyId } from "@/lib/auth";
import { db } from "@/lib/db";
import { constraintViolated } from "@/lib/db/errors";
import { companies } from "@/lib/db/schema";

export type CompanyAssignmentResult = {
  ok: boolean;
  error?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function submittedUuid(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return null;
  return value;
}

function submittedOptionalUuid(
  formData: FormData,
  name: string
): string | null | undefined {
  const value = formData.get(name);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return undefined;
  return value;
}

async function companyContext(): Promise<{
  companyId: string;
  eventId: string;
} | null> {
  const companyId = await getCompanyId();
  if (!companyId) return null;
  const rows = await db
    .select({ eventId: companies.eventId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return rows[0] ? { companyId, eventId: rows[0].eventId } : null;
}

function refreshSchedules(eventId: string): void {
  revalidatePath("/portal/schedule");
  revalidatePath("/portal/schedule/review");
  revalidatePath(`/admin/events/${eventId}/assignments`);
  revalidatePath("/admin");
}

function conflictResult(error: unknown): CompanyAssignmentResult | null {
  if (constraintViolated(error, "assignments_attorney_slot_unique")) {
    return {
      ok: false,
      error: "That attorney was just booked for this time. Choose another attorney or slot.",
    };
  }
  if (constraintViolated(error, "assignments_company_slot_unique")) {
    return {
      ok: false,
      error: "Your company already has an interview in this time slot.",
    };
  }
  return null;
}

/**
 * Create or atomically change a company-owned assignment. The INSERT and UPDATE
 * each carry all scope, event-state, lifecycle, interviewer-ownership, and
 * availability predicates in their one mutation statement. Unique constraints
 * remain the final authority for concurrent booking races.
 */
export async function saveCompanyAssignment(
  _previous: CompanyAssignmentResult,
  formData: FormData
): Promise<CompanyAssignmentResult> {
  const context = await companyContext();
  if (!context) return { ok: false, error: "Your company session has expired." };

  const assignmentValue = formData.get("assignmentId");
  const assignmentId =
    assignmentValue === null || assignmentValue === ""
      ? null
      : submittedUuid(formData, "assignmentId");
  const timeSlotId = submittedUuid(formData, "timeSlotId");
  const attorneyId = submittedUuid(formData, "attorneyId");
  const interviewerId = submittedOptionalUuid(formData, "interviewerId");

  if (assignmentValue !== null && assignmentValue !== "" && !assignmentId) {
    return { ok: false, error: "That assignment identifier is invalid." };
  }
  if (!timeSlotId) return { ok: false, error: "That time slot is invalid." };
  if (!attorneyId) return { ok: false, error: "Choose a valid attorney." };
  if (interviewerId === undefined) {
    return { ok: false, error: "Choose a valid interviewer." };
  }

  try {
    const result = assignmentId
      ? await db.execute<{ id: string }>(sql`
          update assignments as target
          set attorney_id = candidate.id,
              time_slot_id = slot.id,
              interviewer_id = cast(${interviewerId} as uuid),
              updated_at = now()
          from companies as company
          join events as event on event.id = company.event_id
          join time_slots as slot on slot.id = cast(${timeSlotId} as uuid)
          join event_days as day on day.id = slot.event_day_id
          join attorneys as candidate
            on candidate.id = cast(${attorneyId} as uuid)
           and candidate.event_id = company.event_id
          where target.id = cast(${assignmentId} as uuid)
            and target.company_id = company.id
            and company.id = cast(${context.companyId} as uuid)
            and day.event_id = company.event_id
            and event.status = 'open'
            and candidate.status <> 'withdrawn'
            and (
              cast(${interviewerId} as uuid) is null
              or exists (
                select 1
                from company_interviewers as interviewer
                where interviewer.id = cast(${interviewerId} as uuid)
                  and interviewer.company_id = company.id
              )
            )
            and not exists (
              select 1
              from attorney_unavailability as unavailable
              where unavailable.attorney_id = candidate.id
                and (
                  unavailable.time_slot_id = slot.id
                  or unavailable.event_day_id = day.id
                )
            )
          returning target.id
        `)
      : await db.execute<{ id: string }>(sql`
          insert into assignments (
            company_id,
            attorney_id,
            time_slot_id,
            interviewer_id,
            source,
            status
          )
          select company.id,
                 candidate.id,
                 slot.id,
                 cast(${interviewerId} as uuid),
                 'company',
                 'confirmed'
          from companies as company
          join events as event on event.id = company.event_id
          join time_slots as slot on slot.id = cast(${timeSlotId} as uuid)
          join event_days as day on day.id = slot.event_day_id
          join attorneys as candidate
            on candidate.id = cast(${attorneyId} as uuid)
           and candidate.event_id = company.event_id
          where company.id = cast(${context.companyId} as uuid)
            and day.event_id = company.event_id
            and event.status = 'open'
            and candidate.status <> 'withdrawn'
            and (
              cast(${interviewerId} as uuid) is null
              or exists (
                select 1
                from company_interviewers as interviewer
                where interviewer.id = cast(${interviewerId} as uuid)
                  and interviewer.company_id = company.id
              )
            )
            and not exists (
              select 1
              from attorney_unavailability as unavailable
              where unavailable.attorney_id = candidate.id
                and (
                  unavailable.time_slot_id = slot.id
                  or unavailable.event_day_id = day.id
                )
            )
          returning id
        `);

    if (result.rows.length !== 1) {
      return {
        ok: false,
        error:
          "This selection could not be saved. Scheduling may have closed, or the slot, attorney, or interviewer is no longer available.",
      };
    }
  } catch (error) {
    const conflict = conflictResult(error);
    if (conflict) return conflict;
    throw error;
  }

  refreshSchedules(context.eventId);
  return { ok: true };
}

/**
 * Removal is a conditional DELETE, not status='cancelled'. The schema's unique
 * constraints are unconditional, so deleting the owned row is what genuinely
 * releases both the company/slot and attorney/slot bookings.
 */
export async function removeCompanyAssignment(
  _previous: CompanyAssignmentResult,
  formData: FormData
): Promise<CompanyAssignmentResult> {
  const context = await companyContext();
  if (!context) return { ok: false, error: "Your company session has expired." };
  const assignmentId = submittedUuid(formData, "assignmentId");
  if (!assignmentId) {
    return { ok: false, error: "That assignment identifier is invalid." };
  }

  const result = await db.execute<{ id: string }>(sql`
    delete from assignments as target
    using companies as company, events as event
    where target.id = cast(${assignmentId} as uuid)
      and target.company_id = company.id
      and company.id = cast(${context.companyId} as uuid)
      and event.id = company.event_id
      and event.status = 'open'
    returning target.id
  `);

  if (result.rows.length !== 1) {
    return {
      ok: false,
      error:
        "That interview could not be removed. It may not belong to your company, or scheduling may have closed.",
    };
  }

  refreshSchedules(context.eventId);
  return { ok: true };
}
