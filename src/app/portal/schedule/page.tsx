import Link from "next/link";
import {
  AssignAllControl,
  type InterviewerOption,
} from "./interviewer-controls";
import CompanyScheduleGrid from "./schedule-grid";
import { getCompanyScheduleProjection } from "./data";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const projection = await getCompanyScheduleProjection();
  if (!projection) {
    return (
      <div className="text-slate-500">Session expired. Please sign in again.</div>
    );
  }

  const open = projection.event.status === "open";
  const interviewers: InterviewerOption[] = projection.interviewers;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Schedule &amp; Select Attorneys
          </h1>
          <p className="mt-1 text-slate-500">
            {projection.company.name} · {projection.assignments.length} selected
            interview{projection.assignments.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/portal/schedule/review"
          className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        >
          Print View →
        </Link>
      </div>

      <div
        className={`mb-6 rounded-lg border p-4 text-sm ${
          open
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        <p className="font-medium">
          {open
            ? "Selections are open. Choose, change, or remove attorneys in the time grid below."
            : "Selections are closed. Your confirmed schedule remains available to review and print."}
        </p>
        {projection.company.preferredPlatform ? (
          <p className="mt-1">
            Preferred virtual platform: {projection.company.preferredPlatform}.
            Meeting details can be finalized after schedules are confirmed.
          </p>
        ) : (
          <p className="mt-1">
            Add a preferred virtual platform in your{" "}
            <Link href="/portal/profile" className="font-medium underline">
              company profile
            </Link>
            .
          </p>
        )}
      </div>

      {interviewers.length === 0 ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          You haven&apos;t added any interviewers yet. You can select attorneys now
          and{" "}
          <Link href="/portal/interviewers" className="font-medium underline">
            add interviewers
          </Link>{" "}
          for assignment later.
        </div>
      ) : interviewers.length > 1 ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3 shadow-sm">
          <AssignAllControl interviewers={interviewers} disabled={!open} />
          <Link
            href="/portal/interviewers"
            className="text-xs font-medium text-slate-500 underline hover:text-slate-700"
          >
            Manage interviewers
          </Link>
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <span className="font-medium">{interviewers[0].name}</span> is your only
          interviewer and can be assigned to selections in the grid.
        </div>
      )}

      <CompanyScheduleGrid projection={projection} />
    </div>
  );
}
