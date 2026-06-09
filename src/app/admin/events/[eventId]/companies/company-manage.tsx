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
import {
  createCompany,
  deleteCompany,
  regenerateInviteCode,
  setCompanyStatus,
  unclaimCompany,
  updateCompany,
  type ActionResult,
} from "./actions";

export type EditableCompany = {
  id: string;
  name: string;
  website: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
  legalStaffCount: number | null;
  outsideCounselNeed: string | null;
  practiceAreas: unknown;
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  clerkUserId: string | null;
  assignmentCount: number;
};

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

const idle: ActionResult = { ok: false };

function CompanyFields({ company }: { company?: EditableCompany }) {
  const areas = Array.isArray(company?.practiceAreas)
    ? (company!.practiceAreas as string[]).join(", ")
    : "";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Company name *
        </label>
        <input name="name" required defaultValue={company?.name ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">City</label>
        <input name="city" defaultValue={company?.city ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">State</label>
        <input name="state" defaultValue={company?.state ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Website</label>
        <input name="website" defaultValue={company?.website ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Legal staff count
        </label>
        <input
          type="number"
          name="legalStaffCount"
          min={0}
          defaultValue={company?.legalStaffCount ?? ""}
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Outside counsel need
        </label>
        <select
          name="outsideCounselNeed"
          defaultValue={company?.outsideCounselNeed ?? ""}
          className={inputClass}
        >
          <option value="">Not set</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Practice areas (comma-separated)
        </label>
        <input
          name="practiceAreas"
          defaultValue={areas}
          placeholder="Litigation, M&A, IP"
          className={inputClass}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
        <input name="description" defaultValue={company?.description ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Contact name</label>
        <input name="contactName" defaultValue={company?.contactName ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Contact title</label>
        <input name="contactTitle" defaultValue={company?.contactTitle ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Contact email</label>
        <input type="email" name="contactEmail" defaultValue={company?.contactEmail ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Contact phone</label>
        <input name="contactPhone" defaultValue={company?.contactPhone ?? ""} className={inputClass} />
      </div>
    </div>
  );
}

export function AddCompanyButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const result = await createCompany(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    idle
  );

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add company
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
            <DialogDescription>
              An invite code is generated automatically — share it with the
              company so they can claim their portal.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="eventId" value={eventId} />
            <CompanyFields />
            {state.error && <p className="text-sm text-red-600">{state.error}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add company"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ManageCompanyButton({
  eventId,
  company,
}: {
  eventId: string;
  company: EditableCompany;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateCompany, idle);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Manage
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{company.name}</DialogTitle>
            <DialogDescription>
              Edit details, manage portal access, or remove the company.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="companyId" value={company.id} />
              <CompanyFields company={company} />
              {state.error && <p className="text-sm text-red-600">{state.error}</p>}
              {state.ok && <p className="text-sm text-emerald-600">Saved.</p>}
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </form>

            <section className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                Status &amp; portal access
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <form action={setCompanyStatus} className="flex items-center gap-2">
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="companyId" value={company.id} />
                  <select
                    name="status"
                    defaultValue={company.status}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                  >
                    <option value="invited">Invited</option>
                    <option value="registered">Registered</option>
                    <option value="selections_complete">Selections Complete</option>
                  </select>
                  <Button type="submit" variant="outline" size="sm">
                    Set status
                  </Button>
                </form>
                <form action={regenerateInviteCode}>
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="companyId" value={company.id} />
                  <Button type="submit" variant="outline" size="sm">
                    New invite code
                  </Button>
                </form>
                {company.clerkUserId && (
                  <form
                    action={unclaimCompany}
                    onSubmit={(e) => {
                      if (
                        !confirm(
                          "Unlink the portal account from this company? The current user loses access until someone claims it again with the invite code."
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="eventId" value={eventId} />
                    <input type="hidden" name="companyId" value={company.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Unlink portal account
                    </Button>
                  </form>
                )}
              </div>
            </section>

            <section className="rounded-md border border-red-200 p-3">
              <h3 className="mb-1 text-sm font-semibold text-red-700">Remove company</h3>
              <p className="mb-2 text-xs text-slate-500">
                Deletes the company, its interviewers, and its{" "}
                {company.assignmentCount} booked interview(s).
              </p>
              <form
                action={deleteCompany}
                onSubmit={(e) => {
                  if (
                    !confirm(
                      `Permanently delete “${company.name}” and its ${company.assignmentCount} booked interview(s)?`
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="eventId" value={eventId} />
                <input type="hidden" name="companyId" value={company.id} />
                <Button type="submit" variant="destructive" size="sm">
                  Delete company
                </Button>
              </form>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
