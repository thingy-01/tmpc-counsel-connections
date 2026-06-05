import { db } from "@/lib/db";
import {
  attorneys,
  attorneyUnavailability,
  eventDays,
  events,
  timeSlots,
} from "@/lib/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import AttorneySearch from "./attorney-search";
import type { UnavailabilityBlock } from "@/components/attorney-picker";

function fmt(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export default async function AttorneysPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  // Two aliases of event_days: one reached via a slot, one referenced directly.
  const slotDay = alias(eventDays, "slot_day");
  const dayDirect = alias(eventDays, "day_direct");

  const [event, attorneyList, days, slotRows, blockRows] = await Promise.all([
    db.query.events.findFirst({ where: eq(events.id, eventId) }),
    db
      .select({
        id: attorneys.id,
        firstName: attorneys.firstName,
        lastName: attorneys.lastName,
        firm: attorneys.firm,
        city: attorneys.city,
        organizationType: attorneys.organizationType,
        practiceAreas: attorneys.practiceAreas,
        email: attorneys.email,
        phone: attorneys.phone,
        status: attorneys.status,
        isUnavailable: attorneys.isUnavailable,
        resumePath: attorneys.resumePath,
        resumeOriginalName: attorneys.resumeOriginalName,
      })
      .from(attorneys)
      .where(eq(attorneys.eventId, eventId))
      .orderBy(attorneys.lastName, attorneys.firstName),
    db
      .select({ id: eventDays.id, label: eventDays.label })
      .from(eventDays)
      .where(eq(eventDays.eventId, eventId))
      .orderBy(asc(eventDays.date)),
    db
      .select({
        id: timeSlots.id,
        dayId: eventDays.id,
        dayLabel: eventDays.label,
        startTime: timeSlots.startTime,
        endTime: timeSlots.endTime,
        sortOrder: timeSlots.sortOrder,
      })
      .from(timeSlots)
      .innerJoin(eventDays, eq(timeSlots.eventDayId, eventDays.id))
      .where(eq(eventDays.eventId, eventId))
      .orderBy(asc(timeSlots.sortOrder)),
    db
      .select({
        id: attorneyUnavailability.id,
        attorneyId: attorneyUnavailability.attorneyId,
        note: attorneyUnavailability.note,
        timeSlotId: attorneyUnavailability.timeSlotId,
        eventDayId: attorneyUnavailability.eventDayId,
        slotStart: timeSlots.startTime,
        slotEnd: timeSlots.endTime,
        slotDayLabel: slotDay.label,
        dayLabel: dayDirect.label,
      })
      .from(attorneyUnavailability)
      .innerJoin(attorneys, eq(attorneyUnavailability.attorneyId, attorneys.id))
      .leftJoin(timeSlots, eq(attorneyUnavailability.timeSlotId, timeSlots.id))
      .leftJoin(slotDay, eq(timeSlots.eventDayId, slotDay.id))
      .leftJoin(dayDirect, eq(attorneyUnavailability.eventDayId, dayDirect.id))
      .where(eq(attorneys.eventId, eventId)),
  ]);

  if (!event) notFound();

  // Build human-readable blocks grouped by attorney.
  const blocksByAttorney = new Map<string, UnavailabilityBlock[]>();
  for (const b of blockRows) {
    const label =
      b.timeSlotId && b.slotStart && b.slotEnd
        ? `${b.slotDayLabel ?? "Day"} · ${fmt(b.slotStart)} – ${fmt(b.slotEnd)}`
        : `${b.dayLabel ?? "Day"} (all day)`;
    const entry: UnavailabilityBlock = {
      id: b.id,
      label,
      note: b.note,
      timeSlotId: b.timeSlotId,
      eventDayId: b.eventDayId,
    };
    const list = blocksByAttorney.get(b.attorneyId) ?? [];
    list.push(entry);
    blocksByAttorney.set(b.attorneyId, list);
  }

  const enriched = attorneyList.map((a) => ({
    ...a,
    blocks: blocksByAttorney.get(a.id) ?? [],
  }));

  const slots = slotRows.map((s) => ({
    id: s.id,
    dayId: s.dayId,
    dayLabel: s.dayLabel,
    label: `${fmt(s.startTime)} – ${fmt(s.endTime)}`,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Attorney Roster</h1>
        <p className="mt-1 text-slate-500">
          {event.name} · {attorneyList.length} attorneys registered
        </p>
      </div>

      <AttorneySearch
        attorneys={enriched}
        eventId={eventId}
        days={days}
        slots={slots}
      />
    </div>
  );
}
