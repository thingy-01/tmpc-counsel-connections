import { db } from "@/lib/db";
import {
  assignments,
  attorneys,
  timeSlots,
  eventDays,
  companies,
  companyInterviewers,
  events,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import { getCompanyId } from "@/lib/auth";
import PrintButton from "./print-button";

function fmt(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export const dynamic = "force-dynamic";

export default async function ScheduleReviewPage() {
  const companyId = await getCompanyId();

  if (!companyId) {
    return (
      <div className="text-slate-500">Session expired. Please sign in again.</div>
    );
  }

  const [company, rows] = await Promise.all([
    db.query.companies.findFirst({ where: eq(companies.id, companyId) }),
    db
      .select({
        assignmentId: assignments.id,
        startTime: timeSlots.startTime,
        endTime: timeSlots.endTime,
        sortOrder: timeSlots.sortOrder,
        dayId: eventDays.id,
        dayLabel: eventDays.label,
        dayDate: eventDays.date,
        dayFormat: eventDays.format,
        firstName: attorneys.firstName,
        lastName: attorneys.lastName,
        firm: attorneys.firm,
        city: attorneys.city,
        email: attorneys.email,
        phone: attorneys.phone,
        organizationType: attorneys.organizationType,
        practiceAreas: attorneys.practiceAreas,
        attorneyId: attorneys.id,
        resumePath: attorneys.resumePath,
        interviewerName: companyInterviewers.name,
      })
      .from(assignments)
      .innerJoin(attorneys, eq(assignments.attorneyId, attorneys.id))
      .innerJoin(timeSlots, eq(assignments.timeSlotId, timeSlots.id))
      .innerJoin(eventDays, eq(timeSlots.eventDayId, eventDays.id))
      .leftJoin(
        companyInterviewers,
        eq(assignments.interviewerId, companyInterviewers.id)
      )
      .where(eq(assignments.companyId, companyId))
      .orderBy(asc(eventDays.date), asc(timeSlots.sortOrder)),
  ]);

  // The event this company belongs to (not just any event in the DB).
  const event = company
    ? await db.query.events.findFirst({ where: eq(events.id, company.eventId) })
    : null;

  // Group by day
  const dayMap = new Map<
    string,
    { label: string; format: string; date: string; interviews: typeof rows }
  >();

  for (const row of rows) {
    if (!dayMap.has(row.dayId)) {
      dayMap.set(row.dayId, {
        label: row.dayLabel,
        format: row.dayFormat,
        date: row.dayDate,
        interviews: [],
      });
    }
    dayMap.get(row.dayId)!.interviews.push(row);
  }

  const days = Array.from(dayMap.values());

  const printedOn = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Screen-only header */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          href="/portal/schedule"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to Schedule
        </Link>
        <PrintButton />
      </div>

      {/* Document */}
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 border-b pb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Counsel Connections Interview Schedule
              </h1>
              <p className="mt-1 text-lg font-semibold text-slate-700">
                {company?.name}
              </p>
            </div>
            <div className="text-right text-sm text-slate-500">
              <p className="font-semibold text-slate-700">{event?.name}</p>
              {event?.location && <p>{event.location}</p>}
              <p className="mt-1">Printed {printedOn}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
            <span>
              <strong>{rows.length}</strong> total interviews
            </span>
            <span>
              <strong>{days.length}</strong> event days
            </span>
            {company?.contactName && (
              <span>Contact: <strong>{company.contactName}</strong></span>
            )}
          </div>
        </div>

        {/* Schedule by day */}
        {days.map((day, di) => (
          <div key={day.label} className={di > 0 ? "mt-10" : ""}>
            <div className="mb-4 flex items-center gap-3 border-b pb-2">
              <h2 className="text-lg font-bold text-slate-800">{day.label}</h2>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  day.format === "virtual"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {day.format === "virtual" ? "Virtual" : "In-Person"}
              </span>
              <span className="text-sm text-slate-400">
                {day.interviews.length} interview{day.interviews.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="space-y-3">
              {day.interviews.map((row) => {
                const areas = Array.isArray(row.practiceAreas)
                  ? (row.practiceAreas as { area?: string }[])
                      .map((p) => p.area)
                      .filter(Boolean)
                      .slice(0, 4)
                      .join(" · ")
                  : "";
                return (
                  <div
                    key={row.assignmentId}
                    className="flex gap-4 rounded-lg border bg-slate-50 p-4"
                  >
                    {/* Time */}
                    <div className="w-28 shrink-0 text-center">
                      <p className="font-bold text-slate-800">{fmt(row.startTime)}</p>
                      <p className="text-xs text-slate-400">—</p>
                      <p className="text-sm text-slate-600">{fmt(row.endTime)}</p>
                      {event?.slotDuration && (
                        <p className="mt-1 text-xs text-slate-400">
                          {event.slotDuration} min
                        </p>
                      )}
                    </div>

                    {/* Attorney details */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold text-slate-900">
                            {row.firstName} {row.lastName}
                          </p>
                          <p className="text-sm font-medium text-slate-700">
                            {row.firm}
                          </p>
                        </div>
                        {row.organizationType && (
                          <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 shrink-0">
                            {row.organizationType.toLowerCase().includes("minority") ||
                            row.organizationType.toLowerCase().includes("woman")
                              ? "MWB"
                              : row.organizationType}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                        {row.city && <span>{row.city}</span>}
                        {row.email && <span>{row.email}</span>}
                        {row.phone && <span>{row.phone}</span>}
                      </div>

                      {areas && (
                        <p className="mt-1.5 text-xs text-slate-400">{areas}</p>
                      )}

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {row.interviewerName && (
                          <span className="text-slate-500">
                            Interviewer:{" "}
                            <span className="font-medium text-slate-700">
                              {row.interviewerName}
                            </span>
                          </span>
                        )}
                        {row.resumePath && (
                          <a
                            href={`/api/attorneys/${row.attorneyId}/resume`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-600 hover:underline print:hidden"
                          >
                            View Resume (PDF)
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="py-20 text-center text-slate-500">
            No interviews scheduled yet.
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 border-t pt-6 text-center text-xs text-slate-400">
          <p>
            {event?.name} · Texas Minority Counsel Program ·{" "}
            {event?.location}
          </p>
          <p className="mt-1">
            Confidential — for {company?.name} use only
          </p>
        </div>
      </div>
    </div>
  );
}
