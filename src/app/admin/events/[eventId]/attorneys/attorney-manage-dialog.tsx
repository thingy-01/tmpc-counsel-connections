"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UnavailabilityBlock } from "@/components/attorney-picker";
import {
  addUnavailability,
  removeUnavailability,
  withdrawAttorney,
  reactivateAttorney,
  uploadResume,
  removeResume,
} from "./actions";

export type ManageableAttorney = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  resumePath: string | null;
  resumeOriginalName: string | null;
  blocks: UnavailabilityBlock[];
};

export type DayOption = { id: string; label: string };
export type SlotOption = { id: string; dayId: string; dayLabel: string; label: string };

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

export default function AttorneyManageDialog({
  eventId,
  attorney,
  days,
  slots,
  open,
  onOpenChange,
}: {
  eventId: string;
  attorney: ManageableAttorney;
  days: DayOption[];
  slots: SlotOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [scope, setScope] = useState<"day" | "slot">("slot");
  const isWithdrawn = attorney.status === "withdrawn";

  // Group slots by day for the <optgroup>s.
  const slotsByDay = days
    .map((d) => ({
      day: d,
      slots: slots.filter((s) => s.dayId === d.id),
    }))
    .filter((g) => g.slots.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {attorney.firstName} {attorney.lastName}
          </DialogTitle>
          <DialogDescription>
            Manage availability, status, and resume.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
          {/* Status */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Status</h3>
            {isWithdrawn ? (
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm text-slate-600">
                  Withdrawn — excluded from all attorney selection.
                </p>
                <form action={reactivateAttorney}>
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="attorneyId" value={attorney.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Reactivate
                  </Button>
                </form>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
                <p className="text-sm text-slate-600">
                  Active — available for selection.
                </p>
                <form action={withdrawAttorney}>
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="attorneyId" value={attorney.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    Withdraw
                  </Button>
                </form>
              </div>
            )}
          </section>

          {/* Availability */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              Unavailable times
            </h3>
            {attorney.blocks.length === 0 ? (
              <p className="mb-3 text-sm text-slate-500">
                No blocks. This attorney is available for all slots.
              </p>
            ) : (
              <ul className="mb-3 space-y-1.5">
                {attorney.blocks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
                  >
                    <span className="text-slate-700">
                      <span className="font-medium">{b.label}</span>
                      {b.note && (
                        <span className="text-slate-500"> — {b.note}</span>
                      )}
                    </span>
                    <form action={removeUnavailability}>
                      <input type="hidden" name="eventId" value={eventId} />
                      <input type="hidden" name="attorneyId" value={attorney.id} />
                      <input type="hidden" name="id" value={b.id} />
                      <Button type="submit" variant="ghost" size="xs">
                        Remove
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <form
              action={addUnavailability}
              className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"
            >
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="attorneyId" value={attorney.id} />
              <input type="hidden" name="scope" value={scope} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScope("slot")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    scope === "slot"
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-600 border border-slate-300"
                  }`}
                >
                  Specific slot
                </button>
                <button
                  type="button"
                  onClick={() => setScope("day")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    scope === "day"
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-600 border border-slate-300"
                  }`}
                >
                  Whole day
                </button>
              </div>

              {scope === "day" ? (
                <select name="eventDayId" className={inputClass} defaultValue="">
                  <option value="" disabled>
                    Select a day…
                  </option>
                  {days.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              ) : (
                <select name="timeSlotId" className={inputClass} defaultValue="">
                  <option value="" disabled>
                    Select a time slot…
                  </option>
                  {slotsByDay.map((g) => (
                    <optgroup key={g.day.id} label={g.day.label}>
                      {g.slots.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}

              <input
                name="note"
                placeholder="Reason (e.g. panel duty)"
                className={inputClass}
              />
              <Button type="submit" size="sm">
                Add block
              </Button>
            </form>
          </section>

          {/* Resume */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              Resume (PDF)
            </h3>
            {attorney.resumePath ? (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <a
                  href={`/api/attorneys/${attorney.id}/resume`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline"
                >
                  {attorney.resumeOriginalName ?? "View resume"}
                </a>
                <form action={removeResume}>
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="attorneyId" value={attorney.id} />
                  <Button type="submit" variant="ghost" size="xs">
                    Remove
                  </Button>
                </form>
              </div>
            ) : (
              <p className="mb-3 text-sm text-slate-500">No resume on file.</p>
            )}

            <form action={uploadResume} className="flex items-center gap-2">
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="attorneyId" value={attorney.id} />
              <input
                type="file"
                name="file"
                accept="application/pdf,.pdf"
                required
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
              />
              <Button type="submit" size="sm">
                {attorney.resumePath ? "Replace" : "Upload"}
              </Button>
            </form>
            <p className="mt-1 text-xs text-slate-400">PDF only, up to 10 MB.</p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
