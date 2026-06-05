"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addInterviewer,
  updateInterviewer,
  deleteInterviewer,
} from "./actions";

export type Interviewer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

export default function InterviewersManager({
  interviewers,
}: {
  interviewers: Interviewer[];
}) {
  const [editing, setEditing] = useState<Interviewer | null>(null);

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Add an interviewer
        </h2>
        <form
          action={addInterviewer}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Name *
            </label>
            <input name="name" required placeholder="Jane Smith" className={inputClass} />
          </div>
          <div className="flex-1 min-w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Email
            </label>
            <input
              name="email"
              type="email"
              placeholder="jane@company.com"
              className={inputClass}
            />
          </div>
          <div className="flex-1 min-w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Phone
            </label>
            <input name="phone" placeholder="(555) 123-4567" className={inputClass} />
          </div>
          <Button type="submit">Add</Button>
        </form>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600">Name</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600">Email</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-600">Phone</th>
              <th className="px-4 py-2.5 text-right font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {interviewers.map((iv) => (
              <tr key={iv.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{iv.name}</td>
                <td className="px-4 py-2.5 text-slate-600">{iv.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{iv.phone ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(iv)}
                    >
                      Edit
                    </Button>
                    <form action={deleteInterviewer}>
                      <input type="hidden" name="id" value={iv.id} />
                      <Button variant="ghost" size="sm" type="submit">
                        Remove
                      </Button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {interviewers.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">
            No interviewers yet. Add your first one above.
          </p>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit interviewer</DialogTitle>
            <DialogDescription>
              Update this interviewer&apos;s contact details.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              action={async (formData) => {
                await updateInterviewer(formData);
                setEditing(null);
              }}
              className="space-y-3"
            >
              <input type="hidden" name="id" value={editing.id} />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Name *
                </label>
                <input
                  name="name"
                  required
                  defaultValue={editing.name}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  defaultValue={editing.email ?? ""}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Phone
                </label>
                <input
                  name="phone"
                  defaultValue={editing.phone ?? ""}
                  className={inputClass}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
