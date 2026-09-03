import Link from "next/link";
import { fmtTime } from "@/lib/format";
import { getCompanyScheduleProjection } from "../data";
import PrintButton from "./print-button";

export const dynamic = "force-dynamic";

export default async function ScheduleReviewPage() {
  const projection = await getCompanyScheduleProjection();
  if (!projection) {
    return (
      <div className="text-slate-500">Session expired. Please sign in again.</div>
    );
  }

  const attorneyById = new Map(
    projection.attorneys.map((attorney) => [attorney.id, attorney])
  );
  const interviewerById = new Map(
    projection.interviewers.map((interviewer) => [interviewer.id, interviewer])
  );
  const assignmentBySlot = new Map(
    projection.assignments.map((assignment) => [assignment.timeSlotId, assignment])
  );
  const scheduledDays = projection.days
    .map((day) => ({
      ...day,
      slots: day.slots
        .map((slot) => ({ slot, assignment: assignmentBySlot.get(slot.id) }))
        .filter((item) => item.assignment),
    }))
    .filter((day) => day.slots.length > 0);
  const printedOn = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          href="/portal/schedule"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to Schedule &amp; Selections
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-4xl">
        <div className="mb-8 border-b pb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Counsel Connections Interview Schedule
              </h1>
              <p className="mt-1 text-lg font-semibold text-slate-700">
                {projection.company.name}
              </p>
            </div>
            <div className="text-right text-sm text-slate-500">
              <p className="font-semibold text-slate-700">
                {projection.event.name}
              </p>
              {projection.event.location && <p>{projection.event.location}</p>}
              <p className="mt-1">Printed {printedOn}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
            <span>
              <strong>{projection.assignments.length}</strong> total interviews
            </span>
            <span>
              <strong>{scheduledDays.length}</strong> event days
            </span>
            {projection.company.preferredPlatform && (
              <span>
                Preferred virtual platform:{" "}
                <strong>{projection.company.preferredPlatform}</strong>
              </span>
            )}
          </div>
        </div>

        {scheduledDays.map((day, dayIndex) => (
          <section key={day.id} className={dayIndex > 0 ? "mt-10" : ""}>
            <div className="mb-4 flex items-center gap-3 border-b pb-2">
              <h2 className="text-lg font-bold text-slate-800">{day.label}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {day.format === "virtual" ? "Virtual" : "In person"}
              </span>
            </div>

            <div className="space-y-3">
              {day.slots.map(({ slot, assignment }) => {
                if (!assignment) return null;
                const attorney = attorneyById.get(assignment.attorneyId);
                if (!attorney) return null;
                const interviewer = assignment.interviewerId
                  ? interviewerById.get(assignment.interviewerId)
                  : null;
                return (
                  <div
                    key={assignment.id}
                    className="flex gap-4 rounded-lg border bg-slate-50 p-4"
                  >
                    <div className="w-28 shrink-0 text-center">
                      <p className="font-bold text-slate-800">
                        {fmtTime(slot.startTime)}
                      </p>
                      <p className="text-xs text-slate-400">—</p>
                      <p className="text-sm text-slate-600">
                        {fmtTime(slot.endTime)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {projection.event.slotDuration} min
                      </p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold text-slate-900">
                            {attorney.firstName} {attorney.lastName}
                          </p>
                          <p className="text-sm font-medium text-slate-700">
                            {attorney.firm}
                          </p>
                        </div>
                        {attorney.organizationType && (
                          <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                            {attorney.organizationType}
                          </span>
                        )}
                      </div>

                      {attorney.city && (
                        <p className="mt-1 text-sm text-slate-500">{attorney.city}</p>
                      )}
                      {attorney.contact && (
                        <p className="mt-1 text-sm text-slate-500">
                          {attorney.contact.email}
                          {attorney.contact.phone
                            ? ` · ${attorney.contact.phone}`
                            : ""}
                        </p>
                      )}
                      {attorney.practiceAreas.length > 0 && (
                        <p className="mt-1.5 text-xs text-slate-500">
                          {attorney.practiceAreas
                            .map((practice) =>
                              practice.percent === null
                                ? practice.area
                                : `${practice.area} (${practice.percent}%)`
                            )
                            .join(" · ")}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-slate-500">
                          Interviewer:{" "}
                          <span className="font-medium text-slate-700">
                            {interviewer?.name ?? "Unassigned"}
                          </span>
                        </span>
                        {attorney.hasResume && (
                          <a
                            href={`/api/attorneys/${attorney.id}/resume`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-600 hover:underline print:hidden"
                          >
                            View Resume (PDF)
                          </a>
                        )}
                      </div>

                      {day.format === "virtual" && (
                        <p className="mt-2 text-xs text-slate-500">
                          Meeting note: preferred platform is{" "}
                          {projection.company.preferredPlatform ?? "not yet specified"};
                          final connection details will be confirmed separately.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {projection.assignments.length === 0 && (
          <div className="py-20 text-center text-slate-500">
            No interviews scheduled yet.
          </div>
        )}

        <div className="mt-10 border-t pt-6 text-center text-xs text-slate-400">
          <p>
            {[
              projection.event.name,
              "Texas Minority Counsel Program",
              projection.event.location,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1">
            Confidential — for {projection.company.name} use only
          </p>
        </div>
      </div>
    </div>
  );
}
