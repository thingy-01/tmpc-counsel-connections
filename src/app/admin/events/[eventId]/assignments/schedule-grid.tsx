"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtTime } from "@/lib/format";
import { saveAssignment, deleteAssignment, type ActionResult } from "./actions";

export type GridCompany = { id: string; name: string };
export type GridSlot = { id: string; startTime: string; endTime: string };
export type GridDay = {
  id: string;
  label: string;
  format: string;
  slots: GridSlot[];
};
export type GridAssignment = {
  id: string;
  companyId: string;
  timeSlotId: string;
  attorneyId: string;
  notes: string | null;
};
export type GridAttorney = {
  id: string;
  /** "Last, First" for sorting/searching */
  name: string;
  firm: string;
  status: string;
  /** Slot ids this attorney is marked unavailable for (incl. expanded day blocks). */
  blockedSlotIds: string[];
  blockNote: string | null;
};

type CellTarget = {
  day: GridDay;
  slot: GridSlot;
  company: GridCompany;
  assignment: GridAssignment | null;
};

const idle: ActionResult = { ok: false };

function CellDialog({
  eventId,
  target,
  attorneys,
  assignments,
  onClose,
}: {
  eventId: string;
  target: CellTarget;
  attorneys: GridAttorney[];
  assignments: GridAssignment[];
  onClose: () => void;
}) {
  const { day, slot, company, assignment } = target;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(assignment?.attorneyId ?? "");

  const [saveState, saveAction, savePending] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const result = await saveAssignment(prev, formData);
      if (result.ok) onClose();
      return result;
    },
    idle
  );
  const [removeState, removeAction, removePending] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const result = await deleteAssignment(prev, formData);
      if (result.ok) onClose();
      return result;
    },
    idle
  );

  // Attorneys already interviewing someone else during this slot.
  const bookedIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) {
      if (a.timeSlotId === slot.id && a.id !== assignment?.id) {
        set.add(a.attorneyId);
      }
    }
    return set;
  }, [assignments, slot.id, assignment?.id]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return attorneys.filter(
      (a) =>
        // Withdrawn attorneys can't be picked (but stay if they're the current pick).
        (a.status !== "withdrawn" || a.id === assignment?.attorneyId) &&
        (!q || a.name.toLowerCase().includes(q) || a.firm.toLowerCase().includes(q))
    );
  }, [attorneys, query, assignment?.attorneyId]);

  const selectedAttorney = attorneys.find((a) => a.id === selected);
  const selectedBlocked = selectedAttorney?.blockedSlotIds.includes(slot.id);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {assignment ? "Edit interview" : "Schedule interview"}
          </DialogTitle>
          <DialogDescription>
            {company.name} · {day.label} · {fmtTime(slot.startTime)} –{" "}
            {fmtTime(slot.endTime)}
          </DialogDescription>
        </DialogHeader>

        <form action={saveAction} className="space-y-3">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="companyId" value={company.id} />
          <input type="hidden" name="timeSlotId" value={slot.id} />
          {assignment && (
            <input type="hidden" name="assignmentId" value={assignment.id} />
          )}

          <input
            type="search"
            placeholder="Filter attorneys by name or firm…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />

          <select
            name="attorneyId"
            size={9}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-sm focus:border-slate-500 focus:outline-none"
          >
            {filtered.map((a) => {
              const booked = bookedIds.has(a.id);
              const blocked = a.blockedSlotIds.includes(slot.id);
              return (
                <option key={a.id} value={a.id} disabled={booked}>
                  {a.name} — {a.firm}
                  {booked ? "  · booked this slot" : blocked ? "  · ⚠ unavailable" : ""}
                </option>
              );
            })}
          </select>
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400">No attorneys match.</p>
          )}

          {selectedBlocked && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {selectedAttorney!.name} is marked unavailable for this time
              {selectedAttorney!.blockNote
                ? ` (${selectedAttorney!.blockNote})`
                : ""}
              . You can still book them if this has been cleared with them.
            </p>
          )}

          <input
            name="notes"
            defaultValue={assignment?.notes ?? ""}
            placeholder="Notes (optional)"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />

          {saveState.error && (
            <p className="text-sm text-red-600">{saveState.error}</p>
          )}
          {removeState.error && (
            <p className="text-sm text-red-600">{removeState.error}</p>
          )}

          <div className="flex items-center justify-between">
            <Button type="submit" disabled={savePending || !selected}>
              {savePending
                ? "Saving…"
                : assignment
                  ? "Save changes"
                  : "Schedule interview"}
            </Button>
            {assignment && (
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                formAction={removeAction}
                disabled={removePending}
              >
                {removePending ? "Removing…" : "Remove interview"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ScheduleGrid({
  eventId,
  days,
  companies,
  assignments,
  attorneys,
}: {
  eventId: string;
  days: GridDay[];
  companies: GridCompany[];
  assignments: GridAssignment[];
  attorneys: GridAttorney[];
}) {
  const [target, setTarget] = useState<CellTarget | null>(null);

  const attorneyById = useMemo(
    () => new Map(attorneys.map((a) => [a.id, a])),
    [attorneys]
  );

  // slotId -> companyId -> assignment
  const cellMap = useMemo(() => {
    const map = new Map<string, Map<string, GridAssignment>>();
    for (const a of assignments) {
      if (!map.has(a.timeSlotId)) map.set(a.timeSlotId, new Map());
      map.get(a.timeSlotId)!.set(a.companyId, a);
    }
    return map;
  }, [assignments]);

  if (companies.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-10 text-center text-slate-500">
        Add companies first — then click any cell here to schedule interviews.
      </div>
    );
  }

  return (
    <>
      {days.map((day) => (
        <div key={day.id} className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-800">{day.label}</h2>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                day.format === "virtual"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {day.format === "virtual" ? "Virtual" : "In-Person"}
            </span>
            <span className="text-xs text-slate-400">
              {day.slots.length} slots ·{" "}
              {day.slots.reduce(
                (sum, s) => sum + (cellMap.get(s.id)?.size ?? 0),
                0
              )}{" "}
              interviews
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
            <table className="border-collapse text-xs">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="sticky left-0 z-10 min-w-[90px] border-r bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">
                    Time
                  </th>
                  {companies.map((c) => (
                    <th
                      key={c.id}
                      className="min-w-[130px] border-r px-2 py-2 text-left font-semibold text-slate-600 last:border-r-0"
                    >
                      <span className="line-clamp-2">{c.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {day.slots.map((slot) => {
                  const slotAssignments = cellMap.get(slot.id);
                  return (
                    <tr key={slot.id} className="border-b last:border-b-0">
                      <td className="sticky left-0 z-10 border-r bg-white px-3 py-2 font-medium text-slate-600">
                        {fmtTime(slot.startTime)}
                      </td>
                      {companies.map((c) => {
                        const cell = slotAssignments?.get(c.id) ?? null;
                        const attorney = cell
                          ? attorneyById.get(cell.attorneyId)
                          : null;
                        return (
                          <td
                            key={c.id}
                            className={`border-r p-0 last:border-r-0 ${
                              cell ? "bg-emerald-50" : "bg-white"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setTarget({ day, slot, company: c, assignment: cell })
                              }
                              className={`block h-full w-full px-2 py-1.5 text-left transition-colors ${
                                cell ? "hover:bg-emerald-100" : "hover:bg-slate-100"
                              }`}
                              title={
                                cell
                                  ? "Edit this interview"
                                  : "Schedule an interview"
                              }
                            >
                              {cell ? (
                                <span>
                                  <span className="block font-medium leading-tight text-slate-800">
                                    {attorney?.name ?? "Unknown attorney"}
                                  </span>
                                  <span className="mt-0.5 block max-w-[120px] truncate leading-tight text-slate-500">
                                    {attorney?.firm ?? ""}
                                  </span>
                                  {cell.notes && (
                                    <span
                                      className="mt-0.5 block max-w-[120px] truncate text-[10px] italic leading-tight text-slate-400"
                                      title={cell.notes}
                                    >
                                      {cell.notes}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-slate-300">+</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {day.slots.length === 0 && (
                  <tr>
                    <td
                      colSpan={companies.length + 1}
                      className="px-3 py-6 text-center text-slate-400"
                    >
                      No time slots — generate them in Days &amp; Slots.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {target && (
        <CellDialog
          eventId={eventId}
          target={target}
          attorneys={attorneys}
          assignments={assignments}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}
