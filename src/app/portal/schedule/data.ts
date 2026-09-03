import "server-only";

import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getCompanyId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  assignments,
  attorneys,
  attorneyUnavailability,
  companies,
  companyInterviewers,
  eventDays,
  events,
  timeSlots,
} from "@/lib/db/schema";
import {
  publicPracticeAreas,
  type PublicPracticeArea,
} from "./practice-display";

export type CompanyScheduleAttorney = {
  id: string;
  firstName: string;
  lastName: string;
  firm: string;
  city: string | null;
  organizationType: string | null;
  practiceAreas: PublicPracticeArea[];
  status: "active" | "withdrawn";
  hasResume: boolean;
  unavailableSlotIds: string[];
  contact?: {
    email: string;
    phone: string | null;
  };
};

export type CompanyScheduleAssignment = {
  id: string;
  attorneyId: string;
  timeSlotId: string;
  interviewerId: string | null;
};

export function assignedAttorneyContact(
  attorney: { email: string; phone: string | null },
  isAssignedToCompany: boolean
): Pick<CompanyScheduleAttorney, "contact"> {
  return isAssignedToCompany
    ? { contact: { email: attorney.email, phone: attorney.phone } }
    : {};
}

export type CompanyScheduleProjection = {
  company: {
    name: string;
    preferredPlatform: string | null;
  };
  event: {
    name: string;
    location: string | null;
    status: string;
    slotDuration: number;
  };
  days: Array<{
    id: string;
    label: string;
    date: string;
    format: string;
    slots: Array<{
      id: string;
      startTime: string;
      endTime: string;
    }>;
  }>;
  attorneys: CompanyScheduleAttorney[];
  assignments: CompanyScheduleAssignment[];
  interviewers: Array<{ id: string; name: string }>;
};


/**
 * The sole company schedule projection. It intentionally never returns staff
 * notes, unavailability reasons/row ids, other company identities, unassigned
 * attorney contact details, or raw resume storage fields.
 */
export async function getCompanyScheduleProjection(): Promise<
  CompanyScheduleProjection | null
> {
  const companyId = await getCompanyId();
  if (!companyId) return null;

  const contexts = await db
    .select({
      eventId: companies.eventId,
      companyName: companies.name,
      preferredPlatform: companies.preferredPlatform,
      eventName: events.name,
      eventLocation: events.location,
      eventStatus: events.status,
      slotDuration: events.slotDuration,
    })
    .from(companies)
    .innerJoin(events, eq(companies.eventId, events.id))
    .where(eq(companies.id, companyId))
    .limit(1);
  const context = contexts[0];
  if (!context) return null;

  const [rawSlots, rawAttorneys, rawBlocks, ownAssignments, otherBookings, interviewers] =
    await Promise.all([
      db
        .select({
          id: timeSlots.id,
          startTime: timeSlots.startTime,
          endTime: timeSlots.endTime,
          dayId: eventDays.id,
          dayLabel: eventDays.label,
          dayDate: eventDays.date,
          dayFormat: eventDays.format,
        })
        .from(timeSlots)
        .innerJoin(eventDays, eq(timeSlots.eventDayId, eventDays.id))
        .where(eq(eventDays.eventId, context.eventId))
        .orderBy(asc(eventDays.date), asc(timeSlots.sortOrder)),
      db
        .select({
          id: attorneys.id,
          firstName: attorneys.firstName,
          lastName: attorneys.lastName,
          firm: attorneys.firm,
          email: attorneys.email,
          phone: attorneys.phone,
          city: attorneys.city,
          organizationType: attorneys.organizationType,
          practiceAreas: attorneys.practiceAreas,
          status: attorneys.status,
          hasResume: sql<boolean>`${attorneys.resumePath} is not null`,
        })
        .from(attorneys)
        .where(eq(attorneys.eventId, context.eventId))
        .orderBy(asc(attorneys.lastName), asc(attorneys.firstName)),
      db
        .select({
          attorneyId: attorneyUnavailability.attorneyId,
          timeSlotId: attorneyUnavailability.timeSlotId,
          eventDayId: attorneyUnavailability.eventDayId,
        })
        .from(attorneyUnavailability)
        .innerJoin(attorneys, eq(attorneyUnavailability.attorneyId, attorneys.id))
        .where(eq(attorneys.eventId, context.eventId)),
      db
        .select({
          id: assignments.id,
          attorneyId: assignments.attorneyId,
          timeSlotId: assignments.timeSlotId,
          interviewerId: assignments.interviewerId,
        })
        .from(assignments)
        .innerJoin(attorneys, eq(assignments.attorneyId, attorneys.id))
        .innerJoin(timeSlots, eq(assignments.timeSlotId, timeSlots.id))
        .innerJoin(eventDays, eq(timeSlots.eventDayId, eventDays.id))
        .where(
          and(
            eq(assignments.companyId, companyId),
            eq(attorneys.eventId, context.eventId),
            eq(eventDays.eventId, context.eventId)
          )
        ),
      db
        .select({
          attorneyId: assignments.attorneyId,
          timeSlotId: assignments.timeSlotId,
        })
        .from(assignments)
        .innerJoin(attorneys, eq(assignments.attorneyId, attorneys.id))
        .where(
          and(
            eq(attorneys.eventId, context.eventId),
            ne(assignments.companyId, companyId)
          )
        ),
      db
        .select({ id: companyInterviewers.id, name: companyInterviewers.name })
        .from(companyInterviewers)
        .where(eq(companyInterviewers.companyId, companyId))
        .orderBy(asc(companyInterviewers.name)),
    ]);

  const daySlots = new Map<string, string[]>();
  for (const slot of rawSlots) {
    const ids = daySlots.get(slot.dayId) ?? [];
    ids.push(slot.id);
    daySlots.set(slot.dayId, ids);
  }

  const unavailableByAttorney = new Map<string, Set<string>>();
  function unavailable(attorneyId: string): Set<string> {
    const existing = unavailableByAttorney.get(attorneyId);
    if (existing) return existing;
    const created = new Set<string>();
    unavailableByAttorney.set(attorneyId, created);
    return created;
  }

  for (const block of rawBlocks) {
    const slotIds = unavailable(block.attorneyId);
    if (block.timeSlotId) slotIds.add(block.timeSlotId);
    if (block.eventDayId) {
      for (const slotId of daySlots.get(block.eventDayId) ?? []) {
        slotIds.add(slotId);
      }
    }
  }
  for (const booking of otherBookings) {
    unavailable(booking.attorneyId).add(booking.timeSlotId);
  }

  const ownAttorneyIds = new Set(ownAssignments.map((item) => item.attorneyId));
  const ownInterviewerIds = new Set(interviewers.map((item) => item.id));
  const safeAttorneys: CompanyScheduleAttorney[] = rawAttorneys
    .filter(
      (attorney) =>
        attorney.status !== "withdrawn" || ownAttorneyIds.has(attorney.id)
    )
    .map((attorney) => ({
      id: attorney.id,
      firstName: attorney.firstName,
      lastName: attorney.lastName,
      firm: attorney.firm,
      city: attorney.city,
      organizationType: attorney.organizationType,
      practiceAreas: publicPracticeAreas(attorney.practiceAreas),
      status: attorney.status === "withdrawn" ? "withdrawn" : "active",
      hasResume: attorney.hasResume,
      unavailableSlotIds: Array.from(
        unavailableByAttorney.get(attorney.id) ?? []
      ),
      ...assignedAttorneyContact(attorney, ownAttorneyIds.has(attorney.id)),
    }));

  const days: CompanyScheduleProjection["days"] = [];
  for (const slot of rawSlots) {
    let day = days.find((item) => item.id === slot.dayId);
    if (!day) {
      day = {
        id: slot.dayId,
        label: slot.dayLabel,
        date: slot.dayDate,
        format: slot.dayFormat,
        slots: [],
      };
      days.push(day);
    }
    day.slots.push({
      id: slot.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
  }

  return {
    company: {
      name: context.companyName,
      preferredPlatform: context.preferredPlatform,
    },
    event: {
      name: context.eventName,
      location: context.eventLocation,
      status: context.eventStatus,
      slotDuration: context.slotDuration,
    },
    days,
    attorneys: safeAttorneys,
    assignments: ownAssignments.map((assignment) => ({
      ...assignment,
      interviewerId:
        assignment.interviewerId && ownInterviewerIds.has(assignment.interviewerId)
          ? assignment.interviewerId
          : null,
    })),
    interviewers,
  };
}
