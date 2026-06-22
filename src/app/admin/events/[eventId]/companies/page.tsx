import { db } from "@/lib/db";
import { companies, events, assignments } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { notFound } from "next/navigation";
import CopyableCode from "./copyable-code";
import {
  AddCompanyButton,
  ManageCompanyButton,
  type EditableCompany,
} from "./company-manage";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    selections_complete: {
      label: "Selections Complete",
      cls: "bg-green-100 text-green-700",
    },
    registered: { label: "Registered", cls: "bg-blue-100 text-blue-700" },
    invited: { label: "Invited", cls: "bg-yellow-100 text-yellow-700" },
  };
  const s = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

function NeedBadge({ need }: { need: string | null }) {
  if (!need) return null;
  const map: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-orange-100 text-orange-700",
    low: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs capitalize ${map[need] ?? "bg-slate-100 text-slate-600"}`}
    >
      {need}
    </span>
  );
}

export default async function CompaniesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const [event, companyList] = await Promise.all([
    db.query.events.findFirst({ where: eq(events.id, eventId) }),
    db
      .select({
        id: companies.id,
        name: companies.name,
        website: companies.website,
        city: companies.city,
        state: companies.state,
        description: companies.description,
        contactName: companies.contactName,
        contactTitle: companies.contactTitle,
        contactEmail: companies.contactEmail,
        contactPhone: companies.contactPhone,
        outsideCounselNeed: companies.outsideCounselNeed,
        legalStaffCount: companies.legalStaffCount,
        status: companies.status,
        practiceAreas: companies.practiceAreas,
        inviteCode: companies.inviteCode,
        clerkUserId: companies.clerkUserId,
      })
      .from(companies)
      .where(eq(companies.eventId, eventId))
      .orderBy(companies.name),
  ]);

  if (!event) notFound();

  // Get assignment counts per company
  const assignmentCounts = await db
    .select({
      companyId: assignments.companyId,
      count: count(),
    })
    .from(assignments)
    .groupBy(assignments.companyId);

  const countMap = new Map(
    assignmentCounts.map((r) => [r.companyId, r.count])
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
          <p className="mt-1 text-slate-500">
            {event.name} · {companyList.length} participating corporations
          </p>
        </div>
        <AddCompanyButton eventId={eventId} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {companyList.map((company) => {
          const interviewCount = countMap.get(company.id) ?? 0;
          const areas = Array.isArray(company.practiceAreas)
            ? (company.practiceAreas as string[]).slice(0, 3)
            : [];

          return (
            <div
              key={company.id}
              className="rounded-lg border bg-white p-5 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{company.name}</h3>
                  {(company.city || company.state) && (
                    <p className="text-xs text-slate-500">
                      {[company.city, company.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={company.status} />
                  <ManageCompanyButton
                    eventId={eventId}
                    company={
                      {
                        ...company,
                        assignmentCount: interviewCount,
                      } as EditableCompany
                    }
                  />
                </div>
              </div>

              {/* Contact */}
              {company.contactName && (
                <div className="mb-3 text-sm text-slate-600">
                  <p className="font-medium">{company.contactName}</p>
                  {company.contactTitle && (
                    <p className="text-xs text-slate-500">{company.contactTitle}</p>
                  )}
                  {company.contactEmail && (
                    <p className="text-xs text-slate-500 truncate">
                      {company.contactEmail}
                    </p>
                  )}
                </div>
              )}

              {/* Stats row */}
              <div className="mt-3 flex items-center gap-4 border-t pt-3">
                <div className="text-center">
                  <p className="text-xl font-bold text-slate-800">
                    {interviewCount}
                  </p>
                  <p className="text-xs text-slate-500">interviews</p>
                </div>
                {company.legalStaffCount != null && (
                  <div className="text-center">
                    <p className="text-xl font-bold text-slate-800">
                      {company.legalStaffCount}
                    </p>
                    <p className="text-xs text-slate-500">legal staff</p>
                  </div>
                )}
                <div className="ml-auto">
                  <NeedBadge need={company.outsideCounselNeed} />
                </div>
              </div>

              {/* Practice areas */}
              {areas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {areas.map((area) => (
                    <span
                      key={area}
                      className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              )}

              {/* Invite code — companies sign in to their portal with this */}
              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Invite code</span>
                  {company.inviteCode ? (
                    <CopyableCode code={company.inviteCode} />
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </div>
                {company.status === "invited" ? (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    Not signed in
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Signed in
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
