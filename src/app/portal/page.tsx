import { db } from "@/lib/db";
import { companies, events, assignments } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { getCompanyId } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { isCompanyProfileComplete } from "./actions";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    selections_complete: {
      label: "Selections Complete",
      cls: "bg-green-100 text-green-700 border-green-200",
    },
    registered: {
      label: "Registered",
      cls: "bg-blue-100 text-blue-700 border-blue-200",
    },
    invited: {
      label: "Invited",
      cls: "bg-yellow-100 text-yellow-700 border-yellow-200",
    },
  };
  const s = map[status] ?? {
    label: status,
    cls: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

export default async function PortalHome() {
  const companyId = await getCompanyId();

  if (!companyId) {
    return (
      <div className="text-slate-500">Session expired. Please sign in again.</div>
    );
  }

  const [company, [{ interviewCount }]] = await Promise.all([
    db.query.companies.findFirst({ where: eq(companies.id, companyId) }),
    db
      .select({ interviewCount: count() })
      .from(assignments)
      .where(eq(assignments.companyId, companyId)),
  ]);

  // The event this company belongs to (not just any event in the DB).
  const event = company
    ? await db.query.events.findFirst({ where: eq(events.id, company.eventId) })
    : null;

  if (!company || !event) {
    return <div className="text-slate-500">Company not found.</div>;
  }

  const profileComplete = await isCompanyProfileComplete(company);

  const startDate = new Date(event.startDate + "T00:00:00").toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric", year: "numeric" }
  );
  const endDate = new Date(event.endDate + "T00:00:00").toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric" }
  );

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{company.name}</h1>
          <StatusBadge status={company.status} />
        </div>
        <p className="mt-1 text-slate-500">Counsel Connections Participant</p>
      </div>

      {/* Prompt new companies to complete their profile. */}
      {!profileComplete && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Welcome! Please complete your company profile.
          </p>
          <p className="mt-0.5 text-sm text-amber-800">
            Add your contact details, practice areas, and other information so
            TMCP and your matched attorneys have what they need.
          </p>
          <Link
            href="/portal/profile"
            className="mt-3 inline-block rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            Complete profile →
          </Link>
        </div>
      )}

      {/* Event info */}
      <Card className="mb-6 bg-white">
        <CardHeader>
          <CardTitle className="text-base">{event.name}</CardTitle>
          <CardDescription>
            {startDate} – {endDate}
            {event.location ? ` · ${event.location}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-3xl font-bold text-slate-800">{interviewCount}</p>
              <p className="text-sm text-slate-500">scheduled interviews</p>
            </div>
            {company.legalStaffCount != null && (
              <div>
                <p className="text-3xl font-bold text-slate-800">
                  {company.legalStaffCount}
                </p>
                <p className="text-sm text-slate-500">legal staff</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contact card */}
      {company.contactName && (
        <Card className="mb-6 bg-white">
          <CardHeader>
            <CardTitle className="text-base">Primary Contact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <p className="font-medium text-slate-800">{company.contactName}</p>
            {company.contactTitle && (
              <p className="text-slate-600">{company.contactTitle}</p>
            )}
            {company.contactEmail && (
              <p className="text-slate-500">{company.contactEmail}</p>
            )}
            {company.contactPhone && (
              <p className="text-slate-500">{company.contactPhone}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/portal/schedule">
          <div className="rounded-lg border bg-white p-5 shadow-sm transition-shadow hover:shadow-md cursor-pointer">
            <p className="font-semibold text-slate-800">My Schedule</p>
            <p className="mt-1 text-sm text-slate-500">
              View your {interviewCount} assigned interviews, grouped by day
            </p>
          </div>
        </Link>
        <Link href="/portal/schedule/review">
          <div className="rounded-lg border bg-white p-5 shadow-sm transition-shadow hover:shadow-md cursor-pointer">
            <p className="font-semibold text-slate-800">Schedule Review</p>
            <p className="mt-1 text-sm text-slate-500">
              Print-ready view of your complete interview schedule
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
