import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { getAttorneyIdentity } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  assignments,
  attorneyResumeReferences,
  attorneys,
  companies,
  companyInterviewers,
  eventDays,
  events,
  timeSlots,
} from "@/lib/db/schema";
import { isSafeExternalUrl } from "@/lib/spreadsheet-safe";

export type AttorneyScheduleProjection = {
  attorney: {
    firstName: string;
    lastName: string;
    status: "active" | "withdrawn";
    resumeUrl: string | null;
  };
  event: { name: string; location: string | null };
  interviews: Array<{
    assignmentId: string;
    timeSlotId: string;
    dayDate: string;
    dayLabel: string;
    format: string;
    startTime: string;
    endTime: string;
    companyName: string;
    preferredPlatform: string | null;
    interviewerName: string | null;
  }>;
  alternativeSlots: Array<{
    id: string;
    dayDate: string;
    dayLabel: string;
    startTime: string;
    endTime: string;
  }>;
  externalResumes: Array<{ label: string; url: string; status: "unverified" }>;
};

/**
 * Attorney-safe projection. No company ids/contact fields, assignment notes,
 * unavailability rows/reasons, request staff notes, or resume storage fields
 * cross this server boundary.
 */
export async function getAttorneyScheduleProjection(): Promise<
  AttorneyScheduleProjection | null
> {
  const identity = await getAttorneyIdentity();
  if (!identity) return null;

  const contexts = await db
    .select({
      firstName: attorneys.firstName,
      lastName: attorneys.lastName,
      status: attorneys.status,
      hasResume: sql<boolean>`${attorneys.resumePath} is not null`,
      eventName: events.name,
      eventLocation: events.location,
    })
    .from(attorneys)
    .innerJoin(events, eq(attorneys.eventId, events.id))
    .where(
      and(
        eq(attorneys.id, identity.attorneyId),
        eq(attorneys.eventId, identity.eventId)
      )
    )
    .limit(1);
  const context = contexts[0];
  if (!context) return null;

  const [interviews, rawSlots, rawReferences] = await Promise.all([
    db
      .select({
        assignmentId: assignments.id,
        timeSlotId: timeSlots.id,
        dayDate: eventDays.date,
        dayLabel: eventDays.label,
        format: eventDays.format,
        startTime: timeSlots.startTime,
        endTime: timeSlots.endTime,
        companyName: companies.name,
        preferredPlatform: companies.preferredPlatform,
        interviewerName: companyInterviewers.name,
      })
      .from(assignments)
      .innerJoin(companies, eq(assignments.companyId, companies.id))
      .innerJoin(timeSlots, eq(assignments.timeSlotId, timeSlots.id))
      .innerJoin(eventDays, eq(timeSlots.eventDayId, eventDays.id))
      .leftJoin(
        companyInterviewers,
        eq(assignments.interviewerId, companyInterviewers.id)
      )
      .where(
        and(
          eq(assignments.attorneyId, identity.attorneyId),
          eq(assignments.status, "confirmed"),
          eq(companies.eventId, identity.eventId),
          eq(eventDays.eventId, identity.eventId)
        )
      )
      .orderBy(asc(eventDays.date), asc(timeSlots.sortOrder)),
    db
      .select({
        id: timeSlots.id,
        dayDate: eventDays.date,
        dayLabel: eventDays.label,
        startTime: timeSlots.startTime,
        endTime: timeSlots.endTime,
      })
      .from(timeSlots)
      .innerJoin(eventDays, eq(timeSlots.eventDayId, eventDays.id))
      .where(eq(eventDays.eventId, identity.eventId))
      .orderBy(asc(eventDays.date), asc(timeSlots.sortOrder)),
    db
      .select({
        url: attorneyResumeReferences.url,
        label: attorneyResumeReferences.label,
      })
      .from(attorneyResumeReferences)
      .where(eq(attorneyResumeReferences.attorneyId, identity.attorneyId))
      .orderBy(asc(attorneyResumeReferences.createdAt)),
  ]);

  return {
    attorney: {
      firstName: context.firstName,
      lastName: context.lastName,
      status: context.status === "withdrawn" ? "withdrawn" : "active",
      resumeUrl: context.hasResume
        ? `/api/attorneys/${identity.attorneyId}/resume`
        : null,
    },
    event: { name: context.eventName, location: context.eventLocation },
    interviews,
    alternativeSlots: rawSlots,
    externalResumes: rawReferences
      .filter((reference) => isSafeExternalUrl(reference.url))
      .map((reference) => ({
        label: reference.label?.trim() || "External resume reference",
        url: reference.url,
        status: "unverified" as const,
      })),
  };
}
