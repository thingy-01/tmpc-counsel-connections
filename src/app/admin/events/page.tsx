import { db } from "@/lib/db";
import {
  events,
  eventDays,
  attorneys,
  companies,
} from "@/lib/db/schema";
import { eq, count, desc } from "drizzle-orm";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import EventForm from "./event-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    open: "bg-green-100 text-green-800 border-green-200",
    draft: "bg-yellow-100 text-yellow-800 border-yellow-200",
    closed: "bg-slate-100 text-slate-700 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${variants[status] ?? variants.draft}`}
    >
      {status}
    </span>
  );
}

export default async function EventsPage() {
  const eventList = await db
    .select()
    .from(events)
    .orderBy(desc(events.startDate));

  const stats = await Promise.all(
    eventList.map(async (e) => {
      const [[{ dayCount }], [{ attorneyCount }], [{ companyCount }]] =
        await Promise.all([
          db.select({ dayCount: count() }).from(eventDays).where(eq(eventDays.eventId, e.id)),
          db.select({ attorneyCount: count() }).from(attorneys).where(eq(attorneys.eventId, e.id)),
          db.select({ companyCount: count() }).from(companies).where(eq(companies.eventId, e.id)),
        ]);
      return { dayCount, attorneyCount, companyCount };
    })
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Events</h1>
        <p className="mt-1 text-slate-500">
          Create and manage Counsel Connections events.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {eventList.length === 0 && (
            <div className="rounded-lg border bg-white p-10 text-center text-slate-500">
              No events yet. Create your first event to get started — then add
              event days, time slots, attorneys, and companies.
            </div>
          )}
          {eventList.map((e, i) => (
            <div key={e.id} className="rounded-lg border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{e.name}</h2>
                    <StatusBadge status={e.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {fmtDate(e.startDate)} – {fmtDate(e.endDate)}
                    {e.location ? ` · ${e.location}` : ""} · {e.slotDuration}-min
                    interviews
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {stats[i].dayCount} days · {stats[i].attorneyCount} attorneys ·{" "}
                    {stats[i].companyCount} companies
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t pt-3 text-sm">
                <Link
                  href={`/admin/events/${e.id}/days`}
                  className="rounded-md border px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Days & Slots
                </Link>
                <Link
                  href={`/admin/events/${e.id}/attorneys`}
                  className="rounded-md border px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Attorneys
                </Link>
                <Link
                  href={`/admin/events/${e.id}/companies`}
                  className="rounded-md border px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Companies
                </Link>
                <Link
                  href={`/admin/events/${e.id}/assignments`}
                  className="rounded-md border px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Master Schedule
                </Link>
                <Link
                  href={`/admin/events/${e.id}/settings`}
                  className="rounded-md border px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Settings
                </Link>
              </div>
            </div>
          ))}
        </div>

        <Card className="h-fit bg-white">
          <CardHeader>
            <CardTitle className="text-base">New Event</CardTitle>
            <CardDescription>
              Set the basics here — you&apos;ll add days and time slots next.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EventForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
