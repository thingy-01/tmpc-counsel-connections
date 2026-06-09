"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createEvent, updateEvent, type ActionResult } from "./actions";

export type EventFormValues = {
  id?: string;
  name?: string;
  description?: string | null;
  location?: string | null;
  startDate?: string;
  endDate?: string;
  slotDuration?: number;
  status?: string;
};

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

/** Create or edit an event. Pass `event` with an id to edit. */
export default function EventForm({ event }: { event?: EventFormValues }) {
  const isEdit = !!event?.id;
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    isEdit ? updateEvent : createEvent,
    { ok: false }
  );

  return (
    <form action={formAction} className="space-y-3">
      {isEdit && <input type="hidden" name="eventId" value={event!.id} />}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Event name *
        </label>
        <input
          name="name"
          required
          defaultValue={event?.name ?? ""}
          placeholder="e.g. 34th Annual TMCP Counsel Connections"
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Description
        </label>
        <input
          name="description"
          defaultValue={event?.description ?? ""}
          placeholder="Optional description"
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Location
        </label>
        <input
          name="location"
          defaultValue={event?.location ?? ""}
          placeholder="e.g. Houston, TX + Virtual"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Start date *
          </label>
          <input
            type="date"
            name="startDate"
            required
            defaultValue={event?.startDate ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            End date *
          </label>
          <input
            type="date"
            name="endDate"
            required
            defaultValue={event?.endDate ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Interview length (minutes) *
          </label>
          <input
            type="number"
            name="slotDuration"
            min={5}
            max={120}
            required
            defaultValue={event?.slotDuration ?? 15}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Status
          </label>
          <select
            name="status"
            defaultValue={event?.status ?? "draft"}
            className={inputClass}
          >
            <option value="draft">Draft — setup in progress</option>
            <option value="open">Open — live for companies</option>
            <option value="closed">Closed — event finished</option>
          </select>
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {isEdit && state.ok && !state.error && (
        <p className="text-sm text-emerald-600">Saved.</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : isEdit ? "Save changes" : "Create event"}
      </Button>
    </form>
  );
}
