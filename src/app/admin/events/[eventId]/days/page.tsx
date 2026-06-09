import { db } from "@/lib/db";
import {
  assignments,
  breakPeriods,
  eventDays,
  events,
  timeSlots,
} from "@/lib/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AddDayForm, DayCard, type DayInfo } from "./days-manager";

export default async function DaysPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const [event, days, breaks, slots] = await Promise.all([
    db.query.events.findFirst({ where: eq(events.id, eventId) }),
    db
      .select()
      .from(eventDays)
      .where(eq(eventDays.eventId, eventId))
      .orderBy(asc(eventDays.date)),
    db
      .select({
        id: breakPeriods.id,
        eventDayId: breakPeriods.eventDayId,
        startTime: breakPeriods.startTime,
        endTime: breakPeriods.endTime,
        label: breakPeriods.label,
      })
      .from(breakPeriods)
      .innerJoin(eventDays, eq(breakPeriods.eventDayId, eventDays.id))
      .where(eq(eventDays.eventId, eventId))
      .orderBy(asc(breakPeriods.startTime)),
    db
      .select({
        id: timeSlots.id,
        eventDayId: timeSlots.eventDayId,
        startTime: timeSlots.startTime,
        endTime: timeSlots.endTime,
        assignmentCount: count(assignments.id),
      })
      .from(timeSlots)
      .innerJoin(eventDays, eq(timeSlots.eventDayId, eventDays.id))
      .leftJoin(assignments, eq(assignments.timeSlotId, timeSlots.id))
      .where(eq(eventDays.eventId, eventId))
      .groupBy(timeSlots.id)
      .orderBy(asc(timeSlots.sortOrder)),
  ]);

  if (!event) notFound();

  const dayInfos: DayInfo[] = days.map((d) => ({
    id: d.id,
    date: d.date,
    label: d.label,
    format: d.format,
    startTime: d.startTime,
    endTime: d.endTime,
    breaks: breaks.filter((b) => b.eventDayId === d.id),
    slots: slots.filter((s) => s.eventDayId === d.id),
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Days &amp; Time Slots</h1>
        <p className="mt-1 text-slate-500">
          {event.name} · {event.slotDuration}-minute interviews. Add days, set
          breaks, and generate the slot grid.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {dayInfos.length === 0 && (
            <div className="rounded-lg border bg-white p-10 text-center text-slate-500">
              No event days yet. Add your first day to build the schedule.
            </div>
          )}
          {dayInfos.map((d) => (
            <DayCard key={d.id} eventId={eventId} day={d} />
          ))}
        </div>

        <Card className="h-fit bg-white">
          <CardHeader>
            <CardTitle className="text-base">Add a Day</CardTitle>
            <CardDescription>
              Slots are generated from the day&apos;s hours in{" "}
              {event.slotDuration}-minute steps, skipping any breaks you add.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddDayForm eventId={eventId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
