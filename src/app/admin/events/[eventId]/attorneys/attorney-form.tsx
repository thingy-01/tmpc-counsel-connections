"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addAttorney, updateAttorney, type ActionResult } from "./actions";

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

export function AttorneyFields({ attorney }: { attorney?: AttorneyFormValues }) {
  const areas = Array.isArray(attorney?.practiceAreas)
    ? (attorney!.practiceAreas as string[]).join(", ")
    : "";
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
        <input
          name="organizationType"
          defaultValue={attorney?.organizationType ?? ""}
          placeholder="e.g. Minority-Owned Firm"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Practice areas (comma-separated)
        </label>
        <input
          name="practiceAreas"
          defaultValue={areas}
          placeholder="Litigation, Labor & Employment"
          className={inputClass}
        />
      </div>
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

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="attorneyId" value={attorney.id} />
      <AttorneyFields attorney={attorney} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}
