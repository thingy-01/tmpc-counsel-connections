import { getRole } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RescheduleRequestsPage() {
  if ((await getRole()) !== "admin") redirect("/");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">
        Reschedule Requests
      </h1>
      <p className="mt-1 text-slate-500">Coming in this release.</p>
    </div>
  );
}
