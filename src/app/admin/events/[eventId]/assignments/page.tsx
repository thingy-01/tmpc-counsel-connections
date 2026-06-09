import { db } from "@/lib/db";
import {
  assignments,
  attorneys,
  attorneyUnavailability,
  companies,
  events,
  eventDays,
  timeSlots,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import ScheduleGrid, {
  type GridAssignment,
  type GridAttorney,
  type GridDay,
} from "./schedule-grid";

export default async function AssignmentsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const [event, companyList, rawSlots, rawAssignments, attorneyList, blocks] =
    await Promise.all([
      db.query.events.findFirst({ where: eq(events.id, eventId) }),
      db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(eq(companies.eventId, eventId))
        .orderBy(companies.name),
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
        .where(eq(eventDays.eventId, eventId))
        .orderBy(asc(eventDays.date), asc(timeSlots.sortOrder)),
      db
        .select({
          id: assignments.id,
          companyId: assignments.companyId,
          timeSlotId: assignments.timeSlotId,
          attorneyId: assignments.attorneyId,
          notes: assignments.notes,
        })
        .from(assignments)
        .innerJoin(companies, eq(assignments.companyId, companies.id))
        .where(eq(companies.eventId, eventId)),
      db
        .select({
          id: attorneys.id,
          firstName: attorneys.firstName,
          lastName: attorneys.lastName,
          firm: attorneys.firm,
          status: attorneys.status,
        })
        .from(attorneys)
        .where(eq(attorneys.eventId, eventId))
        .orderBy(asc(attorneys.lastName), asc(attorneys.firstName)),
      db
        .select({
          attorneyId: attorneyUnavailability.attorneyId,
          timeSlotId: attorneyUnavailability.timeSlotId,
          eventDayId: attorneyUnavailability.eventDayId,
          note: attorneyUnavailability.note,
        })
        .from(attorneyUnavailability)
        .innerJoin(attorneys, eq(attorneyUnavailability.attorneyId, attorneys.id))
        .where(eq(attorneys.eventId, eventId)),
    ]);

  if (!event) notFound();

  // Group slots by day.
  const dayMap = new Map<string, GridDay>();
  for (const slot of rawSlots) {
    if (!dayMap.has(slot.dayId)) {
      dayMap.set(slot.dayId, {
        id: slot.dayId,
        label: slot.dayLabel,
        format: slot.dayFormat,
        slots: [],
      });
    }
    dayMap.get(slot.dayId)!.slots.push({
      id: slot.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
  }
  const days = Array.from(dayMap.values());

  // Expand availability blocks (slot-level + day-level) to concrete slot ids.
  const slotIdsByDay = new Map<string, string[]>();
  for (const slot of rawSlots) {
    const list = slotIdsByDay.get(slot.dayId) ?? [];
    list.push(slot.id);
    slotIdsByDay.set(slot.dayId, list);
  }
  const blockedByAttorney = new Map<string, { slotIds: Set<string>; note: string | null }>();
  for (const b of blocks) {
    const entry =
      blockedByAttorney.get(b.attorneyId) ?? { slotIds: new Set(), note: null };
    if (b.timeSlotId) entry.slotIds.add(b.timeSlotId);
    if (b.eventDayId) {
      for (const sid of slotIdsByDay.get(b.eventDayId) ?? []) entry.slotIds.add(sid);
    }
    if (b.note) entry.note = b.note;
    blockedByAttorney.set(b.attorneyId, entry);
  }

  // All attorneys go to the grid (so withdrawn ones still display on existing
  // assignments); the cell dialog excludes withdrawn from new selection.
  const gridAttorneys: GridAttorney[] = attorneyList.map((a) => {
    const blocked = blockedByAttorney.get(a.id);
    return {
      id: a.id,
      name: `${a.lastName}, ${a.firstName}`,
      firm: a.firm,
      status: a.status,
      blockedSlotIds: blocked ? Array.from(blocked.slotIds) : [],
      blockNote: blocked?.note ?? null,
    };
  });

  const gridAssignments: GridAssignment[] = rawAssignments;
  const totalSlots = rawSlots.length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Master Schedule</h1>
        <p className="mt-1 text-slate-500">
          {event.name} · {gridAssignments.length} interviews assigned ·{" "}
          {companyList.length} companies · {totalSlots} time slots
        </p>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-emerald-100 ring-1 ring-emerald-300" />
          Assigned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-slate-100 ring-1 ring-slate-200" />
          Open
        </span>
        <span>Click any cell to schedule, change, or remove an interview.</span>
      </div>

      {days.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-slate-500">
          No event days yet — set up Days &amp; Slots first.
        </div>
      ) : (
        <ScheduleGrid
          eventId={eventId}
          days={days}
          companies={companyList}
          assignments={gridAssignments}
          attorneys={gridAttorneys}
        />
      )}
    </div>
  );
}
