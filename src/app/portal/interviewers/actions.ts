"use server";

import { db } from "@/lib/db";
import {
  companyInterviewers,
  companies,
  events,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCompanyId } from "@/lib/auth";

export type InterviewerActionResult = { ok: boolean; error?: string };

async function requireCompanyId(): Promise<string> {
  const id = await getCompanyId();
  if (!id) throw new Error("Not authenticated as a company.");
  return id;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: FormDataEntryValue | null, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

async function openSchedulingEventId(companyId: string): Promise<string | null> {
  const rows = await db
    .select({ eventId: companies.eventId })
    .from(companies)
    .innerJoin(events, eq(companies.eventId, events.id))
    .where(and(eq(companies.id, companyId), eq(events.status, "open")))
    .limit(1);
  return rows[0]?.eventId ?? null;
}

async function requireOpenScheduling(companyId: string): Promise<string> {
  const eventId = await openSchedulingEventId(companyId);
  if (!eventId) throw new Error("Scheduling is closed for this event.");
  return eventId;
}

function revalidateSchedules(eventId: string): void {
  revalidatePath("/portal/schedule");
  revalidatePath("/portal/schedule/review");
  revalidatePath(`/admin/events/${eventId}/assignments`);
}

/**
 * If a company has exactly one interviewer, assign that person to every slot
 * that does not already have an interviewer. No-op for 0 or 2+ interviewers.
 * Internal helper — not exported, so it is never exposed as a server action.
 */
async function applyDefaultInterviewer(companyId: string): Promise<void> {
  const list = await db
    .select({ id: companyInterviewers.id })
    .from(companyInterviewers)
    .where(eq(companyInterviewers.companyId, companyId));

  if (list.length !== 1) return;

  await db.execute(sql`
    update assignments as target
    set interviewer_id = ${list[0].id}::uuid,
        updated_at = now()
    from companies as company, events as event
    where target.company_id = company.id
      and company.id = ${companyId}::uuid
      and event.id = company.event_id
      and event.status = 'open'
      and target.interviewer_id is null
  `);
}

async function interviewerBelongsToCompany(
  interviewerId: string,
  companyId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: companyInterviewers.id })
    .from(companyInterviewers)
    .where(
      and(
        eq(companyInterviewers.id, interviewerId),
        eq(companyInterviewers.companyId, companyId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function addInterviewer(formData: FormData) {
  const companyId = await requireCompanyId();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  if (!name) throw new Error("Interviewer name is required.");

  await db.insert(companyInterviewers).values({ companyId, name, email, phone });
  await applyDefaultInterviewer(companyId);

  revalidatePath("/portal/interviewers");
  revalidatePath("/portal/schedule");
}

export async function updateInterviewer(
  formData: FormData
): Promise<InterviewerActionResult> {
  const companyId = await requireCompanyId();
  const eventId = await openSchedulingEventId(companyId);
  if (!eventId) {
    return { ok: false, error: "Scheduling is closed for this event." };
  }
  let id: string;
  try {
    id = requireUuid(formData.get("id"), "Interviewer identifier");
  } catch {
    return { ok: false, error: "That interviewer identifier is invalid." };
  }
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  if (!name) return { ok: false, error: "Interviewer name is required." };

  const result = await db.execute<{ id: string }>(sql`
    update company_interviewers as target
    set name = ${name}, email = ${email}, phone = ${phone}
    from companies as company, events as event
    where target.id = cast(${id} as uuid)
      and target.company_id = company.id
      and company.id = cast(${companyId} as uuid)
      and event.id = company.event_id
      and event.status = 'open'
    returning target.id
  `);
  if (result.rows.length !== 1) {
    return {
      ok: false,
      error:
        "That interviewer could not be updated. It may not belong to your company, or scheduling may have closed.",
    };
  }

  revalidatePath("/portal/interviewers");
  revalidateSchedules(eventId);
  return { ok: true };
}

export async function deleteInterviewer(
  formData: FormData
): Promise<InterviewerActionResult> {
  const companyId = await getCompanyId();
  if (!companyId) {
    return { ok: false, error: "Your company session has expired." };
  }
  const eventId = await openSchedulingEventId(companyId);
  if (!eventId) {
    return { ok: false, error: "Scheduling is closed for this event." };
  }
  let id: string;
  try {
    id = requireUuid(formData.get("id"), "Interviewer identifier");
  } catch {
    return { ok: false, error: "That interviewer identifier is invalid." };
  }

  // FK onDelete: set null clears this interviewer from any assignments.
  const result = await db.execute<{ id: string }>(sql`
    delete from company_interviewers as target
    using companies as company, events as event
    where target.id = cast(${id} as uuid)
      and target.company_id = company.id
      and company.id = cast(${companyId} as uuid)
      and event.id = company.event_id
      and event.status = 'open'
    returning target.id
  `);
  if (result.rows.length !== 1) {
    return {
      ok: false,
      error:
        "That interviewer could not be removed. It may not belong to your company, or scheduling may have closed.",
    };
  }
  await applyDefaultInterviewer(companyId);

  revalidatePath("/portal/interviewers");
  revalidateSchedules(eventId);
  return { ok: true };
}

/** Assign (or clear) the interviewer for a single interview/assignment. */
export async function assignInterviewer(formData: FormData) {
  const companyId = await requireCompanyId();
  const eventId = await requireOpenScheduling(companyId);
  const assignmentId = requireUuid(
    formData.get("assignmentId"),
    "Assignment identifier"
  );
  const raw = (formData.get("interviewerId") as string) ?? "";
  const interviewerId =
    raw === "" ? null : requireUuid(raw, "Interviewer identifier");

  if (interviewerId && !(await interviewerBelongsToCompany(interviewerId, companyId))) {
    throw new Error("That interviewer does not belong to your company.");
  }

  const result = await db.execute<{ id: string }>(sql`
    update assignments as target
    set interviewer_id = cast(${interviewerId} as uuid),
        updated_at = now()
    from companies as company, events as event
    where target.id = cast(${assignmentId} as uuid)
      and target.company_id = company.id
      and company.id = cast(${companyId} as uuid)
      and event.id = company.event_id
      and event.status = 'open'
      and (
        cast(${interviewerId} as uuid) is null
        or exists (
          select 1
          from company_interviewers as interviewer
          where interviewer.id = cast(${interviewerId} as uuid)
            and interviewer.company_id = company.id
        )
      )
    returning target.id
  `);
  if (result.rows.length !== 1) {
    throw new Error(
      "That interview could not be changed. It may not belong to your company, or scheduling may have closed."
    );
  }

  revalidateSchedules(eventId);
}

/** Bulk-assign (or clear) one interviewer across all of the company's slots. */
export async function assignAllToInterviewer(formData: FormData) {
  const companyId = await requireCompanyId();
  const eventId = await requireOpenScheduling(companyId);
  const raw = (formData.get("interviewerId") as string) ?? "";
  const interviewerId =
    raw === "" ? null : requireUuid(raw, "Interviewer identifier");

  if (interviewerId && !(await interviewerBelongsToCompany(interviewerId, companyId))) {
    throw new Error("That interviewer does not belong to your company.");
  }

  await db.execute(sql`
    update assignments as target
    set interviewer_id = cast(${interviewerId} as uuid),
        updated_at = now()
    from companies as company, events as event
    where target.company_id = company.id
      and company.id = cast(${companyId} as uuid)
      and event.id = company.event_id
      and event.status = 'open'
      and (
        cast(${interviewerId} as uuid) is null
        or exists (
          select 1
          from company_interviewers as interviewer
          where interviewer.id = cast(${interviewerId} as uuid)
            and interviewer.company_id = company.id
        )
      )
  `);

  revalidateSchedules(eventId);
}
