"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { fmtTime } from "@/lib/format";
import {
  addBreak,
  addDay,
  addSlot,
  deleteDay,
  deleteSlot,
  generateSlots,
  removeBreak,
  updateDay,
  type ActionResult,
} from "./actions";

export type BreakInfo = {
  id: string;
  startTime: string;
  endTime: string;
  label: string | null;
};

export type SlotInfo = {
  id: string;
  startTime: string;
  endTime: string;
  assignmentCount: number;
};

export type DayInfo = {
  id: string;
  date: string;
  label: string;
  format: string;
  startTime: string;
  endTime: string;
  breaks: BreakInfo[];
  slots: SlotInfo[];
};

const inputClass =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

const idle: ActionResult = { ok: false };

function toInputTime(t: string) {
  // "09:00:00" -> "09:00" for <input type="time">
  return t.slice(0, 5);
}

export function AddDayForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(addDay, idle);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Date *</label>
          <input type="date" name="date" required className={`${inputClass} w-full`} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Format</label>
          <select name="format" className={`${inputClass} w-full`}>
            <option value="in_person">In-Person</option>
            <option value="virtual">Virtual</option>
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Label
        </label>
        <input
          name="label"
          placeholder="Defaults to e.g. “Monday, October 6”"
          className={`${inputClass} w-full`}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            First interview starts *
          </label>
          <input type="time" name="startTime" required defaultValue="09:00" className={`${inputClass} w-full`} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Last interview ends by *
          </label>
          <input type="time" name="endTime" required defaultValue="17:00" className={`${inputClass} w-full`} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="generateSlots" defaultChecked />
        Generate time slots now
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add day"}
      </Button>
    </form>
  );
}

function EditDayForm({
  eventId,
  day,
  onDone,
}: {
  eventId: string;
  day: DayInfo;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateDay, idle);

  return (
    <form action={formAction} className="space-y-2 rounded-md border bg-slate-50 p-3">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="dayId" value={day.id} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input type="date" name="date" required defaultValue={day.date} className={inputClass} />
        <select name="format" defaultValue={day.format} className={inputClass}>
          <option value="in_person">In-Person</option>
          <option value="virtual">Virtual</option>
        </select>
        <input
          name="label"
          defaultValue={day.label}
          placeholder="Day label"
          className={`${inputClass} sm:col-span-2`}
        />
        <input type="time" name="startTime" required defaultValue={toInputTime(day.startTime)} className={inputClass} />
        <input type="time" name="endTime" required defaultValue={toInputTime(day.endTime)} className={inputClass} />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && state.message && (
        <p className="text-sm text-emerald-600">{state.message}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save day"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Close
        </Button>
      </div>
    </form>
  );
}

function BreaksSection({ eventId, day }: { eventId: string; day: DayInfo }) {
  const [state, formAction, pending] = useActionState(addBreak, idle);

  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Breaks
      </h4>
      {day.breaks.length === 0 ? (
        <p className="mb-2 text-sm text-slate-400">
          No breaks — slots run straight through.
        </p>
      ) : (
        <ul className="mb-2 space-y-1">
          {day.breaks.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-md border px-2.5 py-1 text-sm"
            >
              <span className="text-slate-700">
                {fmtTime(b.startTime)} – {fmtTime(b.endTime)}
                {b.label && <span className="text-slate-500"> · {b.label}</span>}
              </span>
              <form action={removeBreak}>
                <input type="hidden" name="eventId" value={eventId} />
                <input type="hidden" name="breakId" value={b.id} />
                <Button type="submit" variant="ghost" size="xs">
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="dayId" value={day.id} />
        <input type="time" name="startTime" required className={inputClass} />
        <span className="text-xs text-slate-400">to</span>
        <input type="time" name="endTime" required className={inputClass} />
        <input name="label" placeholder="Label (e.g. Lunch)" className={inputClass} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Add break
        </Button>
      </form>
      {state.error && <p className="mt-1 text-sm text-red-600">{state.error}</p>}
      {state.ok && state.message && (
        <p className="mt-1 text-sm text-amber-600">{state.message}</p>
      )}
    </div>
  );
}

function SlotsSection({ eventId, day }: { eventId: string; day: DayInfo }) {
  const [expanded, setExpanded] = useState(false);
  const [genState, genAction, genPending] = useActionState(generateSlots, idle);
  const [addState, addAction, addPending] = useActionState(addSlot, idle);

  const booked = day.slots.reduce((sum, s) => sum + s.assignmentCount, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Time slots — {day.slots.length} slots · {booked} interviews booked
        </h4>
        <div className="flex items-center gap-2">
          <form action={genAction}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="dayId" value={day.id} />
            <Button type="submit" variant="outline" size="sm" disabled={genPending}>
              {genPending
                ? "Working…"
                : day.slots.length === 0
                  ? "Generate slots"
                  : "Regenerate slots"}
            </Button>
          </form>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide slots" : "Show slots"}
          </Button>
        </div>
      </div>
      {genState.message && (
        <p className="mt-1 text-sm text-emerald-600">{genState.message}</p>
      )}

      {expanded && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {day.slots.map((s) => (
              <span
                key={s.id}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                  s.assignmentCount > 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
                title={
                  s.assignmentCount > 0
                    ? `${s.assignmentCount} interview(s) booked`
                    : "No interviews booked"
                }
              >
                {fmtTime(s.startTime)}
                {s.assignmentCount > 0 && (
                  <span className="font-semibold">({s.assignmentCount})</span>
                )}
                <form
                  action={deleteSlot}
                  onSubmit={(e) => {
                    if (
                      s.assignmentCount > 0 &&
                      !confirm(
                        `This slot has ${s.assignmentCount} booked interview(s) that will be deleted with it. Continue?`
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="slotId" value={s.id} />
                  <button
                    type="submit"
                    className="ml-0.5 text-slate-400 hover:text-red-600"
                    title="Delete slot"
                  >
                    ×
                  </button>
                </form>
              </span>
            ))}
            {day.slots.length === 0 && (
              <p className="text-sm text-slate-400">
                No slots yet. Generate them from the day&apos;s hours, or add one
                manually below.
              </p>
            )}
          </div>

          <form action={addAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="dayId" value={day.id} />
            <span className="text-xs text-slate-500">Add a one-off slot:</span>
            <input type="time" name="startTime" required className={inputClass} />
            <span className="text-xs text-slate-400">to</span>
            <input type="time" name="endTime" required className={inputClass} />
            <Button type="submit" variant="outline" size="sm" disabled={addPending}>
              Add slot
            </Button>
          </form>
          {addState.error && <p className="text-sm text-red-600">{addState.error}</p>}
        </div>
      )}
    </div>
  );
}

export function DayCard({ eventId, day }: { eventId: string; day: DayInfo }) {
  const [editing, setEditing] = useState(false);
  const booked = day.slots.reduce((sum, s) => sum + s.assignmentCount, 0);

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{day.label}</h3>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                day.format === "virtual"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {day.format === "virtual" ? "Virtual" : "In-Person"}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {day.date} · {fmtTime(day.startTime)} – {fmtTime(day.endTime)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Close" : "Edit day"}
          </Button>
          <form
            action={deleteDay}
            onSubmit={(e) => {
              if (
                !confirm(
                  booked > 0
                    ? `Delete “${day.label}”? Its ${day.slots.length} slots and ${booked} booked interview(s) will be permanently deleted.`
                    : `Delete “${day.label}” and its ${day.slots.length} slots?`
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="dayId" value={day.id} />
            <Button type="submit" variant="destructive" size="sm">
              Delete
            </Button>
          </form>
        </div>
      </div>

      {editing && (
        <div className="mt-3">
          <EditDayForm eventId={eventId} day={day} onDone={() => setEditing(false)} />
        </div>
      )}

      <div className="mt-4 space-y-4 border-t pt-4">
        <BreaksSection eventId={eventId} day={day} />
        <SlotsSection eventId={eventId} day={day} />
      </div>
    </div>
  );
}
