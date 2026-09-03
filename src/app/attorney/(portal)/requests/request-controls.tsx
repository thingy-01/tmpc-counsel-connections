"use client";

import { useActionState } from "react";
import { fmtDate, fmtTime } from "@/lib/format";
import {
  submitRescheduleRequest,
  withdrawRescheduleRequest,
  type AttorneyRequestActionResult,
} from "./actions";

const initial: AttorneyRequestActionResult = { ok: false };

type InterviewOption = {
  assignmentId: string;
  companyName: string;
  dayDate: string;
  startTime: string;
};

type SlotOption = {
  id: string;
  dayDate: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
};

export function NewRequestForm({
  interviews,
  slots,
  defaultAssignmentId,
}: {
  interviews: InterviewOption[];
  slots: SlotOption[];
  defaultAssignmentId?: string;
}) {
  const [state, action, pending] = useActionState(
    submitRescheduleRequest,
    initial
  );

  return (
    <form action={action} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <label htmlFor="assignmentId" className="text-sm font-medium text-slate-800">
          Interview to change
        </label>
        <select
          id="assignmentId"
          name="assignmentId"
          required
          defaultValue={defaultAssignmentId ?? ""}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Choose an interview
          </option>
          {interviews.map((interview) => (
            <option key={interview.assignmentId} value={interview.assignmentId}>
              {interview.companyName} · {fmtDate(interview.dayDate)} ·{" "}
              {fmtTime(interview.startTime)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="reason" className="text-sm font-medium text-slate-800">
          Reason for the change
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          maxLength={2000}
          rows={4}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Tell staff what changed and any timing constraints."
        />
      </div>
      <div>
        <label htmlFor="preferredSlotId" className="text-sm font-medium text-slate-800">
          Preferred alternatives (optional)
        </label>
        <select
          id="preferredSlotId"
          name="preferredSlotId"
          multiple
          size={Math.min(6, Math.max(3, slots.length))}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.dayLabel} · {fmtDate(slot.dayDate)} · {fmtTime(slot.startTime)}–
              {fmtTime(slot.endTime)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Use Command or Control to select more than one. These choices are
          advisory; staff will confirm the actual move.
        </p>
      </div>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
          {state.message}
        </p>
      )}
      {interviews.length === 0 && (
        <p className="text-sm text-slate-600">
          You have no confirmed interviews to reschedule.
        </p>
      )}
      <button
        type="submit"
        disabled={pending || interviews.length === 0}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}

export function WithdrawRequestButton({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(
    withdrawRescheduleRequest,
    initial
  );
  return (
    <form action={action} className="mt-3 print:hidden">
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
      >
        {pending ? "Withdrawing…" : "Withdraw request"}
      </button>
      {state.error && <p className="mt-1 text-sm text-red-700">{state.error}</p>}
      {state.message && (
        <p className="mt-1 text-sm text-emerald-700">{state.message}</p>
      )}
    </form>
  );
}
