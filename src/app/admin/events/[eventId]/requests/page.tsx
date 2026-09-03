import { and, asc, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  assignments,
  attorneyRescheduleRequests,
  attorneys,
  eventDays,
  events,
  timeSlots,
} from "@/lib/db/schema";
import { fmtDate, fmtTime } from "@/lib/format";
import {
  effectiveRescheduleStatus,
  isRescheduleStatus,
  type RescheduleStatus,
} from "@/lib/reschedule";
import {
  safePreferredAlternatives,
  safeRequestSnapshot,
} from "@/app/attorney/(portal)/requests/data";
import RequestReview from "./request-review";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<RescheduleStatus, string> = {
  open: "Open",
  in_review: "In review",
  resolved_declined: "Declined",
  resolved_rescheduled: "Rescheduled",
  withdrawn: "Withdrawn",
  superseded: "Superseded",
};

export default async function RescheduleRequestsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  if ((await getRole()) !== "admin") redirect("/");
  const { eventId } = await params;

  const [event, rawRequests, slots] = await Promise.all([
    db.query.events.findFirst({
      where: eq(events.id, eventId),
      columns: { name: true, status: true },
    }),
    db
      .select({
        id: attorneyRescheduleRequests.id,
        assignmentId: attorneyRescheduleRequests.assignmentId,
        status: attorneyRescheduleRequests.status,
        reason: attorneyRescheduleRequests.reason,
        preferredAlternatives:
          attorneyRescheduleRequests.preferredAlternatives,
        staffNote: attorneyRescheduleRequests.staffNote,
        snapshot: attorneyRescheduleRequests.snapshot,
        createdAt: attorneyRescheduleRequests.createdAt,
        attorneyFirstName: attorneys.firstName,
        attorneyLastName: attorneys.lastName,
        attorneyFirm: attorneys.firm,
        currentSlotId: assignments.timeSlotId,
      })
      .from(attorneyRescheduleRequests)
      .innerJoin(
        attorneys,
        and(
          eq(attorneyRescheduleRequests.attorneyId, attorneys.id),
          eq(attorneys.eventId, eventId)
        )
      )
      .leftJoin(
        assignments,
        eq(attorneyRescheduleRequests.assignmentId, assignments.id)
      )
      .where(eq(attorneyRescheduleRequests.eventId, eventId))
      .orderBy(desc(attorneyRescheduleRequests.createdAt)),
    db
      .select({
        id: timeSlots.id,
        dayDate: eventDays.date,
        dayLabel: eventDays.label,
        startTime: timeSlots.startTime,
        endTime: timeSlots.endTime,
      })
      .from(timeSlots)
      .innerJoin(eventDays, eq(timeSlots.eventDayId, eventDays.id))
      .where(eq(eventDays.eventId, eventId))
      .orderBy(asc(eventDays.date), asc(timeSlots.sortOrder)),
  ]);
  if (!event) notFound();

  const requests = rawRequests.flatMap((request) => {
    if (!isRescheduleStatus(request.status)) return [];
    return [
      {
        ...request,
        status: effectiveRescheduleStatus(
          request.status,
          request.assignmentId
        ),
        snapshot: safeRequestSnapshot(request.snapshot),
        preferredAlternatives: safePreferredAlternatives(
          request.preferredAlternatives
        ),
      },
    ];
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Reschedule Requests
        </h1>
        <p className="mt-1 text-slate-500">
          {event.name} ·{" "}
          {event.status === "closed"
            ? `Event closed; staff review remains available · ${requests.length} ${requests.length === 1 ? "request" : "requests"}`
            : `${requests.length} ${requests.length === 1 ? "request" : "requests"}`}
        </p>
      </div>

      <div className="space-y-4">
        {requests.map((request) => (
          <article key={request.id} className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">
                  {request.attorneyFirstName} {request.attorneyLastName}
                </h2>
                <p className="text-sm text-slate-500">{request.attorneyFirm}</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {request.snapshot.companyName || "Original interview"}
                </p>
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

            <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-slate-700">
              <p className="font-medium text-slate-800">Attorney&apos;s reason</p>
              <p className="mt-1 whitespace-pre-wrap">{request.reason || "No reason provided."}</p>
            </div>

            {request.preferredAlternatives.length > 0 && (
              <div className="mt-3 text-sm text-slate-600">
                <p className="font-medium text-slate-700">Preferred alternatives</p>
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

            {request.status === "superseded" && (
              <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                The underlying assignment was deleted. The original snapshot is
                retained; this request is terminal and cannot be resolved.
              </p>
            )}

            <RequestReview
              eventId={eventId}
              requestId={request.id}
              status={request.status}
              staffNote={request.staffNote ?? ""}
              currentSlotId={request.currentSlotId}
              slots={slots}
            />
          </article>
        ))}
        {requests.length === 0 && (
          <div className="rounded-lg border bg-white p-10 text-center text-slate-500">
            No reschedule requests for this event.
          </div>
        )}
      </div>
    </div>
  );
}
