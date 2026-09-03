import { redirect } from "next/navigation";
import { fmtDate, fmtTime } from "@/lib/format";
import type { RescheduleStatus } from "@/lib/reschedule";
import { getAttorneyScheduleProjection } from "../schedule/data";
import { getAttorneyRequestProjection } from "./data";
import { NewRequestForm, WithdrawRequestButton } from "./request-controls";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<RescheduleStatus, string> = {
  open: "Waiting for staff review",
  in_review: "In review",
  resolved_declined: "Declined",
  resolved_rescheduled: "Rescheduled",
  withdrawn: "Withdrawn",
  superseded: "Superseded — original booking no longer exists",
};

export default async function AttorneyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ assignment?: string }>;
}) {
  const [schedule, requests] = await Promise.all([
    getAttorneyScheduleProjection(),
    getAttorneyRequestProjection(),
  ]);
  if (!schedule || !requests) redirect("/attorney/login");

  const requestedDefault = (await searchParams).assignment;
  const defaultAssignmentId = schedule.interviews.some(
    (interview) => interview.assignmentId === requestedDefault
  )
    ? requestedDefault
    : undefined;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Reschedule requests
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Your current booking remains in place until staff confirms a change.
        </p>
      </div>

      {schedule.attorney.status === "withdrawn" ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Your event enrollment is withdrawn. Existing request history remains
          visible, but this page is read-only and no new request can be submitted.
        </div>
      ) : (
        <NewRequestForm
          interviews={schedule.interviews}
          slots={schedule.alternativeSlots}
          defaultAssignmentId={defaultAssignmentId}
        />
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Request history</h2>
        <div className="mt-3 space-y-3">
          {requests.map((request) => (
            <article key={request.id} className="rounded-lg border bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {request.snapshot.companyName || "Interview"}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {request.snapshot.dayLabel}
                    {request.snapshot.dayDate
                      ? ` · ${fmtDate(request.snapshot.dayDate)}`
                      : ""}
                    {request.snapshot.startTime
                      ? ` · ${fmtTime(request.snapshot.startTime)}–${fmtTime(
                          request.snapshot.endTime
                        )}`
                      : ""}
                  </p>
                </div>
                <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {STATUS_LABELS[request.status]}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                {request.reason}
              </p>
              {request.preferredAlternatives.length > 0 && (
                <div className="mt-3 text-xs text-slate-500">
                  <p className="font-medium text-slate-600">Preferred alternatives</p>
                  <ul className="mt-1 list-disc pl-5">
                    {request.preferredAlternatives.map((slot) => (
                      <li key={slot.timeSlotId}>
                        {slot.dayLabel} · {fmtDate(slot.dayDate)} ·{" "}
                        {fmtTime(slot.startTime)}–{fmtTime(slot.endTime)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {schedule.attorney.status !== "withdrawn" &&
                (request.status === "open" || request.status === "in_review") && (
                  <WithdrawRequestButton requestId={request.id} />
                )}
            </article>
          ))}
          {requests.length === 0 && (
            <p className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500">
              You have not submitted a reschedule request.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
