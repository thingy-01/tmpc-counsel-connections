import { db } from "@/lib/db";
import {
  attorneys,
  companies,
  assignments,
  timeSlots,
  eventDays,
} from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

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

export default async function AdminDashboard() {
  // Load the most recent event
  const event = await db.query.events.findFirst({
    orderBy: (events, { desc }) => [desc(events.startDate)],
  });

  if (!event) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-500">
        <p>No events yet.</p>
        <Link
          href="/admin/events"
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Create your first event
        </Link>
      </div>
    );
  }

  // Parallel counts
  const [[{ attorneyCount }], [{ companyCount }], [{ assignmentCount }], days] =
    await Promise.all([
      db
        .select({ attorneyCount: count() })
        .from(attorneys)
        .where(eq(attorneys.eventId, event.id)),
      db
        .select({ companyCount: count() })
        .from(companies)
        .where(eq(companies.eventId, event.id)),
      db
        .select({ assignmentCount: count() })
        .from(assignments)
        .leftJoin(companies, eq(assignments.companyId, companies.id))
        .where(eq(companies.eventId, event.id)),
      db
        .select({ id: eventDays.id, label: eventDays.label, format: eventDays.format })
        .from(eventDays)
        .where(eq(eventDays.eventId, event.id))
        .orderBy(eventDays.date),
    ]);

  const [{ slotCount }] = await db
    .select({ slotCount: count() })
    .from(timeSlots)
    .leftJoin(eventDays, eq(timeSlots.eventDayId, eventDays.id))
    .where(eq(eventDays.eventId, event.id));

  const stats = [
    {
      label: "Attorneys",
      value: attorneyCount,
      description: "Registered outside counsel",
      href: `/admin/events/${event.id}/attorneys`,
    },
    {
      label: "Companies",
      value: companyCount,
      description: "Participating corporations",
      href: `/admin/events/${event.id}/companies`,
    },
    {
      label: "Assignments",
      value: assignmentCount,
      description: "Scheduled interviews",
      href: `/admin/events/${event.id}/assignments`,
    },
    {
      label: "Time Slots",
      value: slotCount,
      description: `Across ${days.length} event days`,
      href: null,
    },
  ];

  const startDate = new Date(event.startDate + "T00:00:00").toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", year: "numeric" }
  );
  const endDate = new Date(event.endDate + "T00:00:00").toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", year: "numeric" }
  );

  return (
    <div>
      {/* Event header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{event.name}</h1>
          <StatusBadge status={event.status} />
        </div>
        <p className="mt-1 text-slate-500">
          {startDate} – {endDate}
          {event.location ? ` · ${event.location}` : ""}
        </p>
      </div>

      {/* Stats grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="bg-white">
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl font-bold text-slate-800">
                {stat.value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500">{stat.description}</p>
              {stat.href && (
                <Link
                  href={stat.href}
                  className="mt-2 inline-block text-xs font-medium text-slate-600 underline-offset-2 hover:underline"
                >
                  View →
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Event days */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base">Event Days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {days.map((day) => (
              <div key={day.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm font-medium text-slate-700">{day.label}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    day.format === "virtual"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {day.format === "virtual" ? "Virtual" : "In-Person"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link
          href={`/admin/events/${event.id}/attorneys`}
          className="rounded-lg border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <p className="font-semibold text-slate-800">Attorney Roster</p>
          <p className="mt-1 text-sm text-slate-500">
            Search and browse all registered attorneys
          </p>
        </Link>
        <Link
          href={`/admin/events/${event.id}/companies`}
          className="rounded-lg border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <p className="font-semibold text-slate-800">Company List</p>
          <p className="mt-1 text-sm text-slate-500">
            View all participating corporations
          </p>
        </Link>
        <Link
          href={`/admin/events/${event.id}/assignments`}
          className="rounded-lg border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <p className="font-semibold text-slate-800">Master Schedule</p>
          <p className="mt-1 text-sm text-slate-500">
            Full assignment grid — replaces the spreadsheet
          </p>
        </Link>
      </div>
    </div>
  );
}
