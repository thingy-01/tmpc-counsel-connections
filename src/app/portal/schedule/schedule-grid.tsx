"use client";

import { useActionState, useMemo, useState } from "react";
import { CompanyAttorneyPicker } from "@/components/attorney-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtTime } from "@/lib/format";
import {
  removeCompanyAssignment,
  saveCompanyAssignment,
  type CompanyAssignmentResult,
} from "./actions";
import type { CompanyScheduleProjection } from "./data";

type Day = CompanyScheduleProjection["days"][number];
type Slot = Day["slots"][number];
type Assignment = CompanyScheduleProjection["assignments"][number];

type Target = {
  day: Day;
  slot: Slot;
  assignment: Assignment | null;
};

const idle: CompanyAssignmentResult = { ok: false };

function platformLabel(value: string | null): string {
  if (!value) return "No preferred platform saved";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SelectionDialog({
  target,
  projection,
  onClose,
}: {
  target: Target;
  projection: CompanyScheduleProjection;
  onClose: () => void;
}) {
  const { day, slot, assignment } = target;
  const [attorneyId, setAttorneyId] = useState(assignment?.attorneyId ?? "");
  const [interviewerId, setInterviewerId] = useState(
    assignment?.interviewerId ?? ""
  );
  const [saveState, saveAction, saving] = useActionState(
    async (previous: CompanyAssignmentResult, formData: FormData) => {
      const result = await saveCompanyAssignment(previous, formData);
      if (result.ok) onClose();
      return result;
    },
    idle
  );
  const [removeState, removeAction, removing] = useActionState(
    async (previous: CompanyAssignmentResult, formData: FormData) => {
      const result = await removeCompanyAssignment(previous, formData);
      if (result.ok) onClose();
      return result;
    },
    idle
  );
  const selected = projection.attorneys.find(
    (attorney) => attorney.id === attorneyId
  );
  const selectedCannotSave =
    !selected ||
    selected.status === "withdrawn" ||
    (selected.unavailableSlotIds.includes(slot.id) &&
      selected.id !== assignment?.attorneyId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {assignment ? "Change interview selection" : "Choose an interviewee"}
          </DialogTitle>
          <DialogDescription>
            {day.label} · {fmtTime(slot.startTime)}–{fmtTime(slot.endTime)} ·{" "}
            {day.format === "virtual" ? "Virtual" : "In person"}
          </DialogDescription>
        </DialogHeader>

        <CompanyAttorneyPicker
          attorneys={projection.attorneys}
          slotId={slot.id}
          value={attorneyId}
          onSelect={setAttorneyId}
        />

        <form action={saveAction} className="space-y-3">
          {assignment && (
            <input type="hidden" name="assignmentId" value={assignment.id} />
          )}
          <input type="hidden" name="timeSlotId" value={slot.id} />
          <input type="hidden" name="attorneyId" value={attorneyId} />

          <label className="block text-sm font-medium text-slate-700">
            Company interviewer
            <select
              name="interviewerId"
              value={interviewerId}
              onChange={(event) => setInterviewerId(event.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {projection.interviewers.map((interviewer) => (
                <option key={interviewer.id} value={interviewer.id}>
                  {interviewer.name}
                </option>
              ))}
            </select>
          </label>

          {day.format === "virtual" && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Preferred virtual platform: {platformLabel(projection.company.preferredPlatform)}.
              Meeting details can be finalized with the selected attorney after schedules
              are confirmed.
            </p>
          )}

          {(saveState.error || removeState.error) && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveState.error ?? removeState.error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              type="submit"
              disabled={saving || removing || selectedCannotSave}
            >
              {saving
                ? "Saving…"
                : assignment
                  ? "Save selection"
                  : "Book interview"}
            </Button>
            {assignment && (
              <Button
                type="submit"
                variant="destructive"
                formAction={removeAction}
                disabled={saving || removing}
              >
                {removing ? "Removing…" : "Remove selection"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CompanyScheduleGrid({
  projection,
}: {
  projection: CompanyScheduleProjection;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const open = projection.event.status === "open";
  const assignmentsBySlot = useMemo(
    () =>
      new Map(
        projection.assignments.map((assignment) => [
          assignment.timeSlotId,
          assignment,
        ])
      ),
    [projection.assignments]
  );
  const attorneysById = useMemo(
    () => new Map(projection.attorneys.map((attorney) => [attorney.id, attorney])),
    [projection.attorneys]
  );

  if (projection.days.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-10 text-center text-slate-500">
        Event time slots have not been published yet.
      </div>
    );
  }

  return (
    <>
      {projection.days.map((day) => (
        <section key={day.id} className="mb-8">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">{day.label}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {day.format === "virtual" ? "Virtual" : "In person"}
            </span>
            {day.format === "virtual" && (
              <span className="text-xs text-slate-500">
                Preferred platform: {platformLabel(projection.company.preferredPlatform)}
              </span>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="w-36 px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Your selection</th>
                  <th className="w-36 px-4 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {day.slots.map((slot) => {
                  const assignment = assignmentsBySlot.get(slot.id) ?? null;
                  const attorney = assignment
                    ? attorneysById.get(assignment.attorneyId)
                    : null;
                  return (
                    <tr key={slot.id} className={assignment ? "bg-emerald-50/50" : ""}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                        {fmtTime(slot.startTime)}–{fmtTime(slot.endTime)}
                      </td>
                      <td className="px-4 py-3">
                        {attorney ? (
                          <div>
                            <p className="font-medium text-slate-900">
                              {attorney.firstName} {attorney.lastName}
                            </p>
                            <p className="text-xs text-slate-600">
                              {attorney.firm}
                              {attorney.city ? ` · ${attorney.city}` : ""}
                            </p>
                            {attorney.status === "withdrawn" && (
                              <p className="text-xs font-medium text-amber-700">
                                Withdrawn — retained on your existing schedule
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">Open slot</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant={assignment ? "outline" : "default"}
                          disabled={!open}
                          onClick={() => setTarget({ day, slot, assignment })}
                        >
                          {assignment ? "Change" : "Select"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {target && (
        <SelectionDialog
          key={`${target.slot.id}:${target.assignment?.id ?? "new"}`}
          target={target}
          projection={projection}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}
