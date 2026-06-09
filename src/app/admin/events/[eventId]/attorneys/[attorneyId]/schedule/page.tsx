import { db } from "@/lib/db";
import {
  assignments,
  attorneys,
  companies,
  eventDays,
  events,
  timeSlots,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { fmtTime } from "@/lib/format";
import PrintButton from "@/app/portal/schedule/review/print-button";

/**
 * Print-ready per-attorney (interviewee) schedule — admins send these out
 * before the event, matching the old per-person schedule documents.
 */
export default async function AttorneySchedulePage({
  params,
}: {
  params: Promise<{ eventId: string; attorneyId: string }>;
}) {
  const { eventId, attorneyId } = await params;

  const [event, attorney, rows] = await Promise.all([
    db.query.events.findFirst({ where: eq(events.id, eventId) }),
    db.query.attorneys.findFirst({ where: eq(attorneys.id, attorneyId) }),
    db
      .select({
        assignmentId: assignments.id,
        notes: assignments.notes,
        startTime: timeSlots.startTime,
        endTime: timeSlots.endTime,
        dayId: eventDays.id,
        dayLabel: eventDays.label,
        dayFormat: eventDays.format,
        companyName: companies.name,
        contactName: companies.contactName,
        contactEmail: companies.contactEmail,
        preferredPlatform: companies.preferredPlatform,
      })
      .from(assignments)
      .innerJoin(timeSlots, eq(assignments.timeSlotId, timeSlots.id))
      .innerJoin(eventDays, eq(timeSlots.eventDayId, eventDays.id))
      .innerJoin(companies, eq(assignments.companyId, companies.id))
      .where(eq(assignments.attorneyId, attorneyId))
      .orderBy(asc(eventDays.date), asc(timeSlots.sortOrder)),
  ]);

  if (!event || !attorney) notFound();

  const dayMap = new Map<string, { label: string; format: string; rows: typeof rows }>();
  for (const row of rows) {
    if (!dayMap.has(row.dayId)) {
      dayMap.set(row.dayId, { label: row.dayLabel, format: row.dayFormat, rows: [] });
    }
    dayMap.get(row.dayId)!.rows.push(row);
  }
  const days = Array.from(dayMap.values());

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between print:hidden">
        <Link
          href={`/admin/events/${eventId}/attorneys`}
          className="text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          ← Back to roster
        </Link>
        <PrintButton />
      </div>

      <div className="rounded-lg border bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <div className="border-b pb-4">
          <h1 className="text-xl font-bold text-slate-900">
            {attorney.firstName} {attorney.lastName}
          </h1>
          <p className="text-sm text-slate-600">{attorney.firm}</p>
          <p className="mt-1 text-sm text-slate-500">
            {event.name} — Interview Schedule · {rows.length} interview
            {rows.length === 1 ? "" : "s"}
          </p>
        </div>

        {days.length === 0 && (
          <p className="py-8 text-center text-slate-500">
            No interviews scheduled.
          </p>
        )}

        {days.map((day) => (
          <div key={day.label} className="mt-6">
            <h2 className="mb-2 font-semibold text-slate-800">
              {day.label}{" "}
              <span className="text-sm font-normal text-slate-500">
                ({day.format === "virtual" ? "Virtual" : "In-Person"})
              </span>
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-1.5 pr-4 font-medium">Time</th>
                  <th className="py-1.5 pr-4 font-medium">Company</th>
                  <th className="py-1.5 font-medium">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {day.rows.map((row) => (
                  <tr key={row.assignmentId}>
                    <td className="whitespace-nowrap py-2 pr-4 font-medium text-slate-700">
                      {fmtTime(row.startTime)} – {fmtTime(row.endTime)}
                    </td>
                    <td className="py-2 pr-4">
                      <p className="font-medium text-slate-800">{row.companyName}</p>
                      {row.notes && (
                        <p className="text-xs italic text-slate-500">{row.notes}</p>
                      )}
                    </td>
                    <td className="py-2 text-slate-600">
                      {row.contactName && <p>{row.contactName}</p>}
                      {row.contactEmail && (
                        <p className="text-xs text-slate-500">{row.contactEmail}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
