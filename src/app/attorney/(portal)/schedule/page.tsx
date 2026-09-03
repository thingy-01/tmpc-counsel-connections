import Link from "next/link";
import { redirect } from "next/navigation";
import { dayLabelFromDate, fmtDate, fmtTime } from "@/lib/format";
import { getAttorneyScheduleProjection } from "./data";

export const dynamic = "force-dynamic";

function formatLabel(format: string): string {
  return format === "virtual" ? "Virtual" : "In person";
}

export default async function AttorneySchedulePage() {
  const schedule = await getAttorneyScheduleProjection();
  if (!schedule) redirect("/attorney/login");

  return (
    <div className="min-w-0 bg-white p-4 shadow-sm sm:rounded-xl sm:border sm:p-8 print:border-0 print:p-0 print:shadow-none">
      <div className="mb-8 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {schedule.event.name}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {schedule.attorney.firstName} {schedule.attorney.lastName}
          </h1>
          <p className="mt-1 text-slate-600">Your interview schedule</p>
        </div>
      </div>

      {schedule.attorney.status === "withdrawn" && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Your event enrollment is withdrawn. This schedule is read-only, and
          new reschedule requests cannot be submitted.
        </div>
      )}

      <div className="space-y-4">
        {schedule.interviews.map((interview) => (
          <article
            key={interview.assignmentId}
            className="break-inside-avoid rounded-lg border bg-slate-50 p-4 sm:p-5 print:bg-white"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900">
                  {interview.companyName}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {interview.dayLabel || dayLabelFromDate(interview.dayDate)} ·{" "}
                  {fmtDate(interview.dayDate)}
                </p>
                <p className="mt-1 font-medium text-slate-800">
                  {fmtTime(interview.startTime)}–{fmtTime(interview.endTime)}
                </p>
              </div>
              <span className="w-fit rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                {formatLabel(interview.format)}
              </span>
            </div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-700">Location / connection</dt>
                <dd className="text-slate-600">
                  {interview.format === "virtual"
                    ? interview.preferredPlatform
                      ? `Preferred platform: ${interview.preferredPlatform}`
                      : "Virtual connection details will be confirmed separately."
                    : schedule.event.location || "Location to be confirmed."}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Interviewer</dt>
                <dd className="text-slate-600">
                  {interview.interviewerName || "To be confirmed"}
                </dd>
              </div>
            </dl>
            {schedule.attorney.status !== "withdrawn" && (
              <Link
                href={`/attorney/requests?assignment=${interview.assignmentId}`}
                className="mt-4 inline-block text-sm font-medium text-blue-700 hover:underline print:hidden"
              >
                Ask staff to reschedule this interview
              </Link>
            )}
          </article>
        ))}
      </div>

      {schedule.interviews.length === 0 && (
        <div className="py-14 text-center text-slate-500">
          No confirmed interviews are currently scheduled.
        </div>
      )}

      {(schedule.attorney.resumeUrl || schedule.externalResumes.length > 0) && (
        <section className="mt-8 border-t pt-6 print:hidden">
          <h2 className="font-semibold text-slate-900">Your resume</h2>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {schedule.attorney.resumeUrl && (
              <a
                href={schedule.attorney.resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-700 hover:underline"
              >
                Open uploaded PDF
              </a>
            )}
            {schedule.externalResumes.map((reference) => (
              <a
                key={reference.url}
                href={reference.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="font-medium text-blue-700 hover:underline"
              >
                {reference.label} (unverified external link)
              </a>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-10 border-t pt-4 text-xs text-slate-400">
        Confidential · for the named attorney only
      </footer>
    </div>
  );
}
