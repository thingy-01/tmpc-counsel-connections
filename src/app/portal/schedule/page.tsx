import { db } from "@/lib/db";
import {
  assignments,
  attorneys,
  timeSlots,
  eventDays,
  companies,
  companyInterviewers,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import { getCompanyId } from "@/lib/auth";
import {
  InterviewerSelect,
  AssignAllControl,
} from "./interviewer-controls";

function fmt(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export default async function SchedulePage() {
  const companyId = await getCompanyId();

  if (!companyId) {
    return (
      <div className="text-slate-500">Session expired. Please sign in again.</div>
    );
  }

  const [company, interviewers, rows] = await Promise.all([
    db.query.companies.findFirst({ where: eq(companies.id, companyId) }),
    db
      .select({ id: companyInterviewers.id, name: companyInterviewers.name })
      .from(companyInterviewers)
      .where(eq(companyInterviewers.companyId, companyId))
      .orderBy(asc(companyInterviewers.name)),
    db
      .select({
        assignmentId: assignments.id,
        interviewerId: assignments.interviewerId,
        timeSlotId: timeSlots.id,
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
        attorneyId: attorneys.id,
        resumePath: attorneys.resumePath,
      })
      .from(assignments)
      .innerJoin(attorneys, eq(assignments.attorneyId, attorneys.id))
      .innerJoin(timeSlots, eq(assignments.timeSlotId, timeSlots.id))
      .innerJoin(eventDays, eq(timeSlots.eventDayId, eventDays.id))
      .where(eq(assignments.companyId, companyId))
      .orderBy(asc(eventDays.date), asc(timeSlots.sortOrder)),
  ]);

  const hasInterviewers = interviewers.length > 0;

  // Group by day
  const dayMap = new Map<
    string,
    {
      label: string;
      format: string;
      interviews: typeof rows;
    }
  >();

  for (const row of rows) {
    if (!dayMap.has(row.dayId)) {
      dayMap.set(row.dayId, {
        label: row.dayLabel,
        format: row.dayFormat,
        interviews: [],
      });
    }
    dayMap.get(row.dayId)!.interviews.push(row);
  }

  const days = Array.from(dayMap.values());

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Schedule</h1>
          <p className="mt-1 text-slate-500">
            {company?.name} · {rows.length} interviews across {days.length} days
          </p>
        </div>
        <Link
          href="/portal/schedule/review"
          className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        >
          Print View →
        </Link>
      </div>

      {/* Interviewer helper bar */}
      {!hasInterviewers ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          You haven&apos;t added any interviewers yet.{" "}
          <Link href="/portal/interviewers" className="font-medium underline">
            Manage interviewers
          </Link>{" "}
          to assign people to your slots.
        </div>
      ) : interviewers.length > 1 ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3 shadow-sm">
          <AssignAllControl interviewers={interviewers} />
          <Link
            href="/portal/interviewers"
            className="text-xs font-medium text-slate-500 underline hover:text-slate-700"
          >
            Manage interviewers
          </Link>
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <span className="font-medium">{interviewers[0].name}</span> is assigned
          to all slots by default. Add another interviewer to split slots.
        </div>
      )}

      {days.length === 0 && (
        <div className="rounded-lg border bg-white p-12 text-center text-slate-500">
          No interviews scheduled yet.
        </div>
      )}

      {days.map((day) => (
        <div key={day.label} className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-800">{day.label}</h2>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                day.format === "virtual"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {day.format === "virtual" ? "Virtual" : "In-Person"}
            </span>
            <span className="text-xs text-slate-400">
              {day.interviews.length} interview{day.interviews.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">
                    Time
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">
                    Attorney
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">
                    Firm
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">
                    Interviewer
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">
                    Contact
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {day.interviews.map((row) => (
                  <tr key={row.assignmentId} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                      {fmt(row.startTime)}
                      <span className="text-slate-400"> – </span>
                      {fmt(row.endTime)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">
                        {row.firstName} {row.lastName}
                      </p>
                      {row.resumePath && (
                        <a
                          href={`/api/attorneys/${row.attorneyId}/resume`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          View Resume (PDF)
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.firm}</td>
                    <td className="px-4 py-3">
                      {hasInterviewers ? (
                        <InterviewerSelect
                          assignmentId={row.assignmentId}
                          value={row.interviewerId}
                          interviewers={interviewers}
                        />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.email && (
                        <p className="truncate max-w-[180px]">{row.email}</p>
                      )}
                      {row.phone && <p>{row.phone}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
