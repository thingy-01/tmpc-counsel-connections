"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  assignInterviewer,
  assignAllToInterviewer,
} from "../interviewers/actions";

export type InterviewerOption = { id: string; name: string };

const selectClass =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

/** Per-slot interviewer dropdown that auto-saves on change. */
export function InterviewerSelect({
  assignmentId,
  value,
  interviewers,
}: {
  assignmentId: string;
  value: string | null;
  interviewers: InterviewerOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={assignInterviewer}>
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <select
        name="interviewerId"
        defaultValue={value ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className={selectClass}
      >
        <option value="">— Unassigned —</option>
        {interviewers.map((iv) => (
          <option key={iv.id} value={iv.id}>
            {iv.name}
          </option>
        ))}
      </select>
    </form>
  );
}

/** Bulk control: assign a single interviewer to every slot. */
export function AssignAllControl({
  interviewers,
}: {
  interviewers: InterviewerOption[];
}) {
  return (
    <form action={assignAllToInterviewer} className="flex items-center gap-2">
      <span className="text-xs text-slate-500">Assign one person to all slots:</span>
      <select name="interviewerId" defaultValue="" className={selectClass}>
        <option value="">Choose…</option>
        {interviewers.map((iv) => (
          <option key={iv.id} value={iv.id}>
            {iv.name}
          </option>
        ))}
      </select>
      <Button size="sm" type="submit" variant="outline">
        Apply to all
      </Button>
    </form>
  );
}
