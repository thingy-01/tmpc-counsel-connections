import { db } from "@/lib/db";
import { assignments, companies, events } from "@/lib/db/schema";
import { count, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import EventForm from "../../event-form";
import DangerZone from "./danger-zone";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function EventSettingsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const [event, [{ assignmentCount }]] = await Promise.all([
    db.query.events.findFirst({ where: eq(events.id, eventId) }),
    db
      .select({ assignmentCount: count() })
      .from(assignments)
      .innerJoin(companies, eq(assignments.companyId, companies.id))
      .where(eq(companies.eventId, eventId)),
  ]);

  if (!event) notFound();

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Event Settings</h1>
        <p className="mt-1 text-slate-500">{event.name}</p>
      </div>

      <Card className="mb-6 bg-white">
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>
            Changing the interview length only affects newly generated slots —
            regenerate a day&apos;s slots from Days &amp; Slots to apply it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventForm event={event} />
        </CardContent>
      </Card>

      <DangerZone
        eventId={event.id}
        eventName={event.name}
        assignmentCount={assignmentCount}
      />
    </div>
  );
}
