"use client";

import { useActionState } from "react";
import { fmtDate, fmtTime } from "@/lib/format";
import type { RescheduleStatus } from "@/lib/reschedule";
import { resolveRequestByMoving } from "../assignments/actions";
import {
  transitionStaffRequest,
  type StaffRequestActionResult,
} from "./actions";

const initial: StaffRequestActionResult = { ok: false };

type SlotOption = {
  id: string;
  dayDate: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
};

function ResultMessage({ state }: { state: StaffRequestActionResult }) {
  if (state.error) return <p className="mt-2 text-sm text-red-700">{state.error}</p>;
  if (state.message) {
    return <p className="mt-2 text-sm text-emerald-700">{state.message}</p>;
  }
  return null;
}

export default function RequestReview({
  eventId,
  requestId,
  status,
  staffNote,
  currentSlotId,
  slots,
}: {
  eventId: string;
  requestId: string;
  status: RescheduleStatus;
  staffNote: string;
  currentSlotId: string | null;
  slots: SlotOption[];
}) {
  const [transitionState, transitionAction, transitionPending] = useActionState(
    transitionStaffRequest,
    initial
  );
  const [moveState, moveAction, movePending] = useActionState(
    resolveRequestByMoving,
    initial
  );
  const active = status === "open" || status === "in_review";

  if (!active) {
    return staffNote ? (
      <div className="mt-4 rounded-md bg-slate-100 p-3 text-sm">
        <p className="font-medium text-slate-700">Staff note</p>
        <p className="mt-1 whitespace-pre-wrap text-slate-600">{staffNote}</p>
      </div>
    ) : null;
  }

  return (
    <div className="mt-4 grid gap-4 border-t pt-4 lg:grid-cols-2">
      <form action={transitionAction} className="space-y-3">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="requestId" value={requestId} />
        <div>
          <label htmlFor={`staff-note-${requestId}`} className="text-sm font-medium">
            Staff-only note
          </label>
          <textarea
            id={`staff-note-${requestId}`}
            name="staffNote"
            rows={3}
            maxLength={4000}
            defaultValue={staffNote}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {status === "open" ? (
            <button
              name="status"
              value="in_review"
              disabled={transitionPending}
              className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Mark in review
            </button>
          ) : (
            <button
              name="status"
              value="open"
              disabled={transitionPending}
              className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Return to open
            </button>
          )}
          <button
            name="status"
            value="resolved_declined"
            disabled={transitionPending}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
          >
            Decline request
          </button>
        </div>
        <ResultMessage state={transitionState} />
      </form>

      <form action={moveAction} className="space-y-3 rounded-lg bg-slate-50 p-4">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="requestId" value={requestId} />
        <div>
          <label htmlFor={`new-slot-${requestId}`} className="text-sm font-medium">
            Resolve by rescheduling
          </label>
          <select
            id={`new-slot-${requestId}`}
            name="newSlotId"
            required
            defaultValue=""
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Choose a new time
            </option>
            {slots
              .filter((slot) => slot.id !== currentSlotId)
              .map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.dayLabel} · {fmtDate(slot.dayDate)} ·{" "}
                  {fmtTime(slot.startTime)}–{fmtTime(slot.endTime)}
                </option>
              ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={movePending}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {movePending ? "Moving…" : "Move booking and resolve"}
        </button>
        <ResultMessage state={moveState} />
      </form>
    </div>
  );
}
