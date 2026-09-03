import { getRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import RosterImportClient from "./roster-import-client";

export const dynamic = "force-dynamic";

export default async function RosterImportPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  if ((await getRole()) !== "admin") redirect("/");
  const { eventId } = await params;
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Roster Import</h1>
      <p className="mt-1 text-slate-500">
        Map and validate registration data before explicitly applying attorney changes.
      </p>
      <RosterImportClient eventId={eventId} />
    </div>
  );
}
