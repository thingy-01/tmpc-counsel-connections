"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clearAssignments, deleteEvent } from "../../actions";

/**
 * Destructive event operations, each gated behind a typed confirmation so a
 * stray click can't destroy live event data.
 */
export default function DangerZone({
  eventId,
  eventName,
  assignmentCount,
}: {
  eventId: string;
  eventName: string;
  assignmentCount: number;
}) {
  const [confirming, setConfirming] = useState<"assignments" | "event" | null>(
    null
  );
  const [typed, setTyped] = useState("");

  const armed = typed.trim() === eventName;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-5">
      <h2 className="text-sm font-semibold text-red-800">Danger Zone</h2>
      <p className="mt-1 text-xs text-red-700/80">
        These actions cannot be undone.
      </p>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-white p-3">
          <div>
            <p className="text-sm font-medium text-slate-800">
              Clear all interview assignments
            </p>
            <p className="text-xs text-slate-500">
              Removes all {assignmentCount} scheduled interviews. Days, slots,
              attorneys, and companies are kept.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-red-300 text-red-700 hover:bg-red-50"
            onClick={() => {
              setConfirming("assignments");
              setTyped("");
            }}
          >
            Clear…
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-white p-3">
          <div>
            <p className="text-sm font-medium text-slate-800">
              Delete this event
            </p>
            <p className="text-xs text-slate-500">
              Permanently deletes the event and ALL of its data — days, time
              slots, attorneys, companies, and assignments.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              setConfirming("event");
              setTyped("");
            }}
          >
            Delete…
          </Button>
        </div>
      </div>

      {confirming && (
        <form
          action={confirming === "event" ? deleteEvent : clearAssignments}
          className="mt-4 rounded-md border border-red-300 bg-white p-4"
        >
          <input type="hidden" name="eventId" value={eventId} />
          <p className="text-sm text-slate-700">
            {confirming === "event"
              ? "This deletes the event and everything in it."
              : `This removes all ${assignmentCount} interview assignments.`}{" "}
            Type <span className="font-mono font-semibold">{eventName}</span> to
            confirm.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Event name"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="destructive" size="sm" disabled={!armed}>
              {confirming === "event"
                ? "Permanently delete event"
                : "Clear all assignments"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
