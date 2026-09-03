import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignments,
  attorneys,
  companies,
  companyInterviewers,
  eventDays,
  events,
  timeSlots,
} from "@/lib/db/schema";
import type {
  AudienceAttorney,
  AudienceKind,
  StoredAudience,
} from "./types";
import { sourceHash } from "./preview";
import type { MailMergeAttorney } from "./mail-merge";

export class NotificationEventNotFoundError extends Error {
  constructor() {
    super("Event not found.");
    this.name = "NotificationEventNotFoundError";
  }
}

export async function loadEventAudience(
  eventId: string,
  audience: StoredAudience
): Promise<{
  event: { id: string; name: string; location: string | null; status: string };
  attorneys: AudienceAttorney[];
  sourceHash: string;
}> {
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) throw new NotificationEventNotFoundError();

  const [attorneyRows, scheduleRows] = await Promise.all([
    db
      .select({
        id: attorneys.id,
        firstName: attorneys.firstName,
        lastName: attorneys.lastName,
        email: attorneys.email,
        phone: attorneys.phone,
        firm: attorneys.firm,
        conflicts: attorneys.unavailableNote,
        status: attorneys.status,
      })
      .from(attorneys)
      .where(eq(attorneys.eventId, eventId))
      .orderBy(asc(attorneys.lastName), asc(attorneys.firstName), asc(attorneys.id)),
    db
      .select({
        assignmentId: assignments.id,
        attorneyId: assignments.attorneyId,
        dayDate: eventDays.date,
        dayLabel: eventDays.label,
        dayFormat: eventDays.format,
        startTime: timeSlots.startTime,
        endTime: timeSlots.endTime,
        companyName: companies.name,
        interviewerName: companyInterviewers.name,
        preferredPlatform: companies.preferredPlatform,
      })
      .from(assignments)
      .innerJoin(attorneys, eq(assignments.attorneyId, attorneys.id))
      .innerJoin(companies, eq(assignments.companyId, companies.id))
      .innerJoin(timeSlots, eq(assignments.timeSlotId, timeSlots.id))
      .innerJoin(eventDays, eq(timeSlots.eventDayId, eventDays.id))
      .leftJoin(
        companyInterviewers,
        eq(assignments.interviewerId, companyInterviewers.id)
      )
      .where(
        and(
          eq(attorneys.eventId, eventId),
          eq(companies.eventId, eventId),
          eq(eventDays.eventId, eventId),
          eq(assignments.status, "confirmed")
        )
      )
      .orderBy(
        asc(eventDays.date),
        asc(timeSlots.sortOrder),
        asc(assignments.id)
      ),
  ]);

  const scheduleByAttorney = new Map<
    string,
    AudienceAttorney["schedule"]
  >();
  for (const row of scheduleRows) {
    const schedule = scheduleByAttorney.get(row.attorneyId) ?? [];
    schedule.push({
      assignmentId: row.assignmentId,
      dayDate: row.dayDate,
      dayLabel: row.dayLabel,
      dayFormat: row.dayFormat,
      startTime: row.startTime,
      endTime: row.endTime,
      companyName: row.companyName,
      interviewerName: row.interviewerName,
      preferredPlatform: row.preferredPlatform,
    });
    scheduleByAttorney.set(row.attorneyId, schedule);
  }

  const audienceAttorneys = attorneyRows
    .map((attorney) => ({
      ...attorney,
      schedule: scheduleByAttorney.get(attorney.id) ?? [],
    }))
    .filter((attorney) => audienceMatches(audience.kind, attorney));
  const eventProjection = {
    id: event.id,
    name: event.name,
    location: event.location,
    status: event.status,
  };
  return {
    event: eventProjection,
    attorneys: audienceAttorneys,
    sourceHash: sourceHash({
      event: eventProjection,
      audience,
      attorneys: audienceAttorneys,
    }),
  };
}

function audienceMatches(
  kind: AudienceKind,
  attorney: AudienceAttorney
): boolean {
  if (attorney.status !== "active") return false;
  if (kind === "active_with_confirmed_assignments") {
    return attorney.schedule.length > 0;
  }
  if (kind === "active_without_confirmed_assignments") {
    return attorney.schedule.length === 0;
  }
  return true;
}

export async function loadMailMergeAttorneys(
  eventId: string
): Promise<MailMergeAttorney[]> {
  const projection = await loadEventAudience(eventId, { kind: "all_active" });
  return projection.attorneys
    .filter((attorney) => attorney.schedule.length > 0)
    .map((attorney) => ({
      id: attorney.id,
      firstName: attorney.firstName,
      lastName: attorney.lastName,
      phone: attorney.phone,
      email: attorney.email,
      firm: attorney.firm,
      conflicts: attorney.conflicts,
      interviews: attorney.schedule.map((item) => ({
        dayDate: item.dayDate,
        startTime: item.startTime,
        endTime: item.endTime,
        companyName: item.companyName,
        interviewerName: item.interviewerName,
        preferredPlatform: item.preferredPlatform,
      })),
    }));
}
