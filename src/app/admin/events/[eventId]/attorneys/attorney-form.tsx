"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addAttorney, updateAttorney, type ActionResult } from "./actions";
import {
  ORGANIZATION_TYPES,
  PRACTICE_AREAS,
  isCanonicalOrganizationType,
  isCanonicalPracticeArea,
  parsePracticeAreas,
} from "@/lib/practice-areas";

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

const idle: ActionResult = { ok: false };

export type AttorneyFormValues = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  firm?: string;
  city?: string | null;
  organizationType?: string | null;
  practiceAreas?: unknown;
};

type EditorRow = { area: string; percent: string };

function PracticeAreaEditor({ value }: { value: unknown }) {
  const parsed = parsePracticeAreas(value);
  const [rows, setRows] = useState<EditorRow[]>(() =>
    parsed.entries.length > 0
      ? parsed.entries.map((entry) => ({
          area: entry.area,
          percent: entry.percent?.toString() ?? "",
        }))
      : [{ area: "", percent: "" }]
  );

  function updateRow(index: number, update: Partial<EditorRow>) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...update } : row
      )
    );
  }

  function removeRow(index: number) {
    setRows((current) => {
      const next = current.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [{ area: "", percent: "" }];
    });
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <div>
        <p className="text-xs font-medium text-slate-600">Practice areas</p>
        <p className="text-xs text-slate-400">
          Choose up to two. Supplied percentages must total 100%.
        </p>
      </div>
      {parsed.incomplete && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
          Incomplete imported data: this record has missing percentages or more
          than two areas. It has not been changed automatically.
        </p>
      )}
      {rows.map((row, index) => {
        const exactCanonical = (PRACTICE_AREAS as readonly string[]).includes(
          row.area
        );
        return (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
            <select
              name="practiceArea"
              aria-label={`Practice area ${index + 1}`}
              value={row.area}
              onChange={(event) => updateRow(index, { area: event.target.value })}
              className={inputClass}
            >
              <option value="">Select a practice area…</option>
              {row.area && !exactCanonical && (
                <option value={row.area}>
                  {row.area} (
                  {isCanonicalPracticeArea(row.area)
                    ? "stored spelling"
                    : "stored legacy value"}
                  )
                </option>
              )}
              {PRACTICE_AREAS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
            <div className="relative">
              <input
                type="number"
                name="practicePercent"
                aria-label={`Practice area ${index + 1} percentage`}
                min="0"
                max="100"
                step="0.01"
                value={row.percent}
                onChange={(event) =>
                  updateRow(index, { percent: event.target.value })
                }
                placeholder="Percent"
                className={`${inputClass} pr-7`}
              />
              <span className="pointer-events-none absolute right-2 top-1.5 text-sm text-slate-400">
                %
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRow(index)}
            >
              Remove
            </Button>
          </div>
        );
      })}
      {rows.length < 2 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((current) => [...current, { area: "", percent: "" }])
          }
        >
          Add second area
        </Button>
      )}
    </div>
  );
}

export function AttorneyFields({ attorney }: { attorney?: AttorneyFormValues }) {
  const organizationType = attorney?.organizationType ?? "";
  const exactCanonicalOrganization = (
    ORGANIZATION_TYPES as readonly string[]
  ).includes(organizationType);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          First name *
        </label>
        <input name="firstName" required defaultValue={attorney?.firstName ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Last name *
        </label>
        <input name="lastName" required defaultValue={attorney?.lastName ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Email *</label>
        <input type="email" name="email" required defaultValue={attorney?.email ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
        <input name="phone" defaultValue={attorney?.phone ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Firm *</label>
        <input name="firm" required defaultValue={attorney?.firm ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">City</label>
        <input name="city" defaultValue={attorney?.city ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Organization type
        </label>
        <select
          name="organizationType"
          defaultValue={attorney?.organizationType ?? ""}
          className={inputClass}
        >
          <option value="">Select an organization type…</option>
          {organizationType && !exactCanonicalOrganization && (
            <option value={organizationType}>
              {organizationType} (
              {isCanonicalOrganizationType(organizationType)
                ? "stored spelling"
                : "stored legacy value"}
              )
            </option>
          )}
          {ORGANIZATION_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <PracticeAreaEditor
        key={JSON.stringify(parsePracticeAreas(attorney?.practiceAreas).entries)}
        value={attorney?.practiceAreas}
      />
    </div>
  );
}

export function AddAttorneyButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const result = await addAttorney(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    idle
  );

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add attorney
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Attorney</DialogTitle>
            <DialogDescription>
              Register an outside-counsel attorney for this event.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="eventId" value={eventId} />
            <AttorneyFields />
            {state.error && <p className="text-sm text-red-600">{state.error}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add attorney"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Inline edit form used inside the attorney manage dialog. */
export function EditAttorneySection({
  eventId,
  attorney,
}: {
  eventId: string;
  attorney: AttorneyFormValues & { id: string };
}) {
  const [state, formAction, pending] = useActionState(updateAttorney, idle);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldKey = JSON.stringify([
    attorney.firstName,
    attorney.lastName,
    attorney.email,
    attorney.phone,
    attorney.firm,
    attorney.city,
    attorney.organizationType,
    parsePracticeAreas(attorney.practiceAreas).entries,
  ]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const preventReset = (event: Event) => event.preventDefault();
    form.addEventListener("reset", preventReset, true);
    return () => form.removeEventListener("reset", preventReset, true);
  }, []);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3"
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="attorneyId" value={attorney.id} />
      <AttorneyFields key={fieldKey} attorney={attorney} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}
