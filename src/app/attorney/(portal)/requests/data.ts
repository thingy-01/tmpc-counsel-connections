import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getAttorneyIdentity } from "@/lib/auth";
import { db } from "@/lib/db";
import { attorneyRescheduleRequests } from "@/lib/db/schema";
import {
  effectiveRescheduleStatus,
  isRescheduleStatus,
  type RescheduleStatus,
} from "@/lib/reschedule";

export type RequestSnapshot = {
  companyName: string;
  dayDate: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
};

export type PreferredAlternative = {
  timeSlotId: string;
  dayDate: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
};

export type AttorneyRequestProjection = {
  id: string;
  assignmentId: string | null;
  reason: string;
  status: RescheduleStatus;
  snapshot: RequestSnapshot;
  preferredAlternatives: PreferredAlternative[];
  createdAt: Date | null;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 2000) : "";
}

export function safeRequestSnapshot(value: unknown): RequestSnapshot {
  const item = objectValue(value);
  return {
    companyName: textValue(item.companyName),
    dayDate: textValue(item.dayDate),
    dayLabel: textValue(item.dayLabel),
    startTime: textValue(item.startTime),
    endTime: textValue(item.endTime),
  };
}

export function safePreferredAlternatives(
  value: unknown
): PreferredAlternative[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((raw) => {
    const item = objectValue(raw);
    return {
      timeSlotId: textValue(item.timeSlotId),
      dayDate: textValue(item.dayDate),
      dayLabel: textValue(item.dayLabel),
      startTime: textValue(item.startTime),
      endTime: textValue(item.endTime),
    };
  });
}

/** Explicit attorney projection: staff_note is deliberately not selected. */
export async function getAttorneyRequestProjection(): Promise<
  AttorneyRequestProjection[] | null
> {
  const identity = await getAttorneyIdentity();
  if (!identity) return null;

  const rows = await db
    .select({
      id: attorneyRescheduleRequests.id,
      assignmentId: attorneyRescheduleRequests.assignmentId,
      reason: attorneyRescheduleRequests.reason,
      status: attorneyRescheduleRequests.status,
      snapshot: attorneyRescheduleRequests.snapshot,
      preferredAlternatives: attorneyRescheduleRequests.preferredAlternatives,
      createdAt: attorneyRescheduleRequests.createdAt,
    })
    .from(attorneyRescheduleRequests)
    .where(
      and(
        eq(attorneyRescheduleRequests.attorneyId, identity.attorneyId),
        eq(attorneyRescheduleRequests.eventId, identity.eventId)
      )
    )
    .orderBy(desc(attorneyRescheduleRequests.createdAt));

  return rows.flatMap((row) => {
    if (!isRescheduleStatus(row.status)) return [];
    return [
      {
        id: row.id,
        assignmentId: row.assignmentId,
        reason: row.reason ?? "",
        status: effectiveRescheduleStatus(row.status, row.assignmentId),
        snapshot: safeRequestSnapshot(row.snapshot),
        preferredAlternatives: safePreferredAlternatives(
          row.preferredAlternatives
        ),
        createdAt: row.createdAt,
      },
    ];
  });
}
