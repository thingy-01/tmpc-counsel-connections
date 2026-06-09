"use server";

import { db } from "@/lib/db";
import {
  assignments,
  breakPeriods,
  eventDays,
  events,
  timeSlots,
} from "@/lib/db/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getRole } from "@/lib/auth";
import { constraintViolated } from "@/lib/db/errors";
import { dayLabelFromDate, minutesToTime, timeToMinutes } from "@/lib/format";

export type ActionResult = { ok: boolean; error?: string; message?: string };

async function requireAdmin(): Promise<void> {
  const role = await getRole();
  if (role !== "admin") throw new Error("Admin access required.");
}

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/days`);
  revalidatePath(`/admin/events/${eventId}/assignments`);
  revalidatePath("/admin");
}

function normalizeTime(t: string): string {
  // <input type="time"> gives "HH:MM"; Postgres returns "HH:MM:SS".
  return t.length === 5 ? `${t}:00` : t;
}

export async function addDay(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const date = formData.get("date") as string;
  const label = (formData.get("label") as string)?.trim() || dayLabelFromDate(date);
  const format = (formData.get("format") as string) === "virtual" ? "virtual" : "in_person";
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const generate = formData.get("generateSlots") === "on";

  if (!date) return { ok: false, error: "Pick a date." };
  if (!startTime || !endTime) return { ok: false, error: "Set start and end times." };
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return { ok: false, error: "End time must be after start time." };
  }

  try {
    const [day] = await db
      .insert(eventDays)
      .values({
        eventId,
        date,
        label,
        format,
        startTime: normalizeTime(startTime),
        endTime: normalizeTime(endTime),
      })
      .returning();
    if (generate) await regenerateSlotsForDay(day.id);
  } catch (e) {
    if (constraintViolated(e, "event_days_event_date_unique")) {
      return { ok: false, error: "That date is already on the schedule." };
    }
    throw e;
  }

  revalidate(eventId);
  return { ok: true };
}

export async function updateDay(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const dayId = formData.get("dayId") as string;
  const date = formData.get("date") as string;
  const label = (formData.get("label") as string)?.trim() || dayLabelFromDate(date);
  const format = (formData.get("format") as string) === "virtual" ? "virtual" : "in_person";
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;

  if (!date) return { ok: false, error: "Pick a date." };
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return { ok: false, error: "End time must be after start time." };
  }

  await db
    .update(eventDays)
    .set({
      date,
      label,
      format,
      startTime: normalizeTime(startTime),
      endTime: normalizeTime(endTime),
    })
    .where(eq(eventDays.id, dayId));

  revalidate(eventId);
  return { ok: true, message: "Day updated. Regenerate slots if you changed the hours." };
}

export async function deleteDay(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const dayId = formData.get("dayId") as string;
  await db.delete(eventDays).where(eq(eventDays.id, dayId));
  revalidate(eventId);
}

export async function addBreak(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const dayId = formData.get("dayId") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const label = (formData.get("label") as string)?.trim() || null;

  if (!startTime || !endTime) return { ok: false, error: "Set break start and end times." };
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return { ok: false, error: "Break end must be after its start." };
  }

  await db.insert(breakPeriods).values({
    eventDayId: dayId,
    startTime: normalizeTime(startTime),
    endTime: normalizeTime(endTime),
    label,
  });

  revalidate(eventId);
  return {
    ok: true,
    message: "Break added. Regenerate slots to remove interviews inside it.",
  };
}

export async function removeBreak(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const breakId = formData.get("breakId") as string;
  await db.delete(breakPeriods).where(eq(breakPeriods.id, breakId));
  revalidate(eventId);
}

/**
 * Bring a day's time slots in line with its hours, the event's interview
 * length, and its breaks:
 *  - missing slots are created
 *  - empty slots that no longer fit the grid are removed
 *  - slots with booked interviews are NEVER removed (reported instead)
 * sortOrder is normalized to minutes-from-midnight so ordering is stable.
 */
async function regenerateSlotsForDay(
  dayId: string
): Promise<{ created: number; removed: number; keptConflicts: number }> {
  const day = await db.query.eventDays.findFirst({ where: eq(eventDays.id, dayId) });
  if (!day) throw new Error("Day not found.");
  const event = await db.query.events.findFirst({ where: eq(events.id, day.eventId) });
  if (!event) throw new Error("Event not found.");
  const breaks = await db
    .select()
    .from(breakPeriods)
    .where(eq(breakPeriods.eventDayId, dayId));

  const duration = event.slotDuration;
  const dayStart = timeToMinutes(day.startTime);
  const dayEnd = timeToMinutes(day.endTime);
  const breakRanges = breaks.map((b) => ({
    start: timeToMinutes(b.startTime),
    end: timeToMinutes(b.endTime),
  }));

  // Walk the day in slotDuration steps, jumping over breaks.
  const desired: { start: number; end: number }[] = [];
  let t = dayStart;
  while (t + duration <= dayEnd) {
    const overlapping = breakRanges.find((b) => t < b.end && t + duration > b.start);
    if (overlapping) {
      t = overlapping.end;
      continue;
    }
    desired.push({ start: t, end: t + duration });
    t += duration;
  }

  const existing = await db
    .select({
      id: timeSlots.id,
      startTime: timeSlots.startTime,
      assignmentCount: count(assignments.id),
    })
    .from(timeSlots)
    .leftJoin(assignments, eq(assignments.timeSlotId, timeSlots.id))
    .where(eq(timeSlots.eventDayId, dayId))
    .groupBy(timeSlots.id, timeSlots.startTime);

  const desiredStarts = new Set(desired.map((d) => minutesToTime(d.start) + ":00"));
  const existingByStart = new Map(existing.map((s) => [s.startTime, s]));

  // Remove empty slots that fell off the grid; keep (and report) booked ones.
  const removable = existing.filter(
    (s) => !desiredStarts.has(s.startTime) && s.assignmentCount === 0
  );
  const keptConflicts = existing.filter(
    (s) => !desiredStarts.has(s.startTime) && s.assignmentCount > 0
  ).length;
  if (removable.length > 0) {
    await db.delete(timeSlots).where(
      inArray(
        timeSlots.id,
        removable.map((s) => s.id)
      )
    );
  }

  // Insert missing slots; normalize sortOrder + endTime on existing ones.
  let created = 0;
  for (const d of desired) {
    const startStr = minutesToTime(d.start) + ":00";
    const endStr = minutesToTime(d.end) + ":00";
    const sortOrder = d.start;
    const current = existingByStart.get(startStr);
    if (current) {
      await db
        .update(timeSlots)
        .set({ endTime: endStr, sortOrder })
        .where(eq(timeSlots.id, current.id));
    } else {
      await db.insert(timeSlots).values({
        eventDayId: dayId,
        startTime: startStr,
        endTime: endStr,
        sortOrder,
      });
      created++;
    }
  }

  return { created, removed: removable.length, keptConflicts };
}

export async function generateSlots(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const dayId = formData.get("dayId") as string;

  const result = await regenerateSlotsForDay(dayId);
  revalidate(eventId);

  const parts = [
    `${result.created} slot${result.created === 1 ? "" : "s"} created`,
    `${result.removed} removed`,
  ];
  if (result.keptConflicts > 0) {
    parts.push(
      `${result.keptConflicts} off-grid slot${result.keptConflicts === 1 ? "" : "s"} kept because interviews are booked in them`
    );
  }
  return { ok: true, message: parts.join(", ") + "." };
}

export async function deleteSlot(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const slotId = formData.get("slotId") as string;
  await db.delete(timeSlots).where(eq(timeSlots.id, slotId));
  revalidate(eventId);
}

export async function addSlot(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const dayId = formData.get("dayId") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;

  if (!startTime || !endTime) return { ok: false, error: "Set start and end times." };
  const startMin = timeToMinutes(startTime);
  if (timeToMinutes(endTime) <= startMin) {
    return { ok: false, error: "End time must be after start time." };
  }

  const dupe = await db
    .select({ id: timeSlots.id })
    .from(timeSlots)
    .where(
      and(eq(timeSlots.eventDayId, dayId), eq(timeSlots.startTime, normalizeTime(startTime)))
    )
    .limit(1);
  if (dupe.length > 0) {
    return { ok: false, error: "A slot already starts at that time." };
  }

  await db.insert(timeSlots).values({
    eventDayId: dayId,
    startTime: normalizeTime(startTime),
    endTime: normalizeTime(endTime),
    sortOrder: startMin,
  });

  revalidate(eventId);
  return { ok: true };
}
