"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  UnavailabilityPopover,
  type UnavailabilityBlock,
} from "@/components/attorney-picker";
import AttorneyManageDialog, {
  type DayOption,
  type SlotOption,
} from "./attorney-manage-dialog";
import { parsePracticeAreas } from "@/lib/practice-areas";

type Attorney = {
  id: string;
  firstName: string;
  lastName: string;
  firm: string;
  city: string | null;
  organizationType: string | null;
  practiceAreas: unknown;
  email: string;
  phone: string | null;
  status: string;
  isUnavailable: boolean | null;
  resumePath: string | null;
  resumeOriginalName: string | null;
  resumeReferences: Array<{ url: string; label: string | null; status: string }>;
  assignmentCount: number;
  blocks: UnavailabilityBlock[];
};

function OrgTypeBadge({ orgType }: { orgType: string | null }) {
  if (!orgType) return null;
  const isMinority =
    orgType.toLowerCase().includes("minority") ||
    orgType.toLowerCase().includes("woman");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isMinority
          ? "bg-purple-100 text-purple-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {isMinority ? "MWB" : "Other"}
    </span>
  );
}

export default function AttorneySearch({
  attorneys,
  eventId,
  days,
  slots,
}: {
  attorneys: Attorney[];
  eventId: string;
  days: DayOption[];
  slots: SlotOption[];
}) {
  const [query, setQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [managingId, setManagingId] = useState<string | null>(null);
  const managing = managingId
    ? attorneys.find((attorney) => attorney.id === managingId) ?? null
    : null;

  const orgTypes = useMemo(() => {
    const types = new Set<string>();
    attorneys.forEach((a) => {
      if (a.organizationType) types.add(a.organizationType);
    });
    return Array.from(types).sort();
  }, [attorneys]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return attorneys.filter((a) => {
      const matchesQuery =
        !q ||
        `${a.firstName} ${a.lastName}`.toLowerCase().includes(q) ||
        a.firm.toLowerCase().includes(q) ||
        (a.city ?? "").toLowerCase().includes(q) ||
        (a.email ?? "").toLowerCase().includes(q);
      const matchesOrg =
        orgFilter === "all" || a.organizationType === orgFilter;
      return matchesQuery && matchesOrg;
    });
  }, [attorneys, query, orgFilter]);

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <input
          type="search"
          placeholder="Search by name, firm, or city…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 min-w-48"
        />
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="all">All org types</option>
          {orgTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">
          {filtered.length} of {attorneys.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Firm</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">City</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Org Type</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Practice Areas</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Resume</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((a) => {
              const isWithdrawn = a.status === "withdrawn";
              const practiceAreaData = parsePracticeAreas(a.practiceAreas);
              return (
                <tr
                  key={a.id}
                  className={`hover:bg-slate-50 ${isWithdrawn ? "opacity-60" : ""}`}
                >
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {a.lastName}, {a.firstName}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{a.firm}</td>
                  <td className="px-4 py-2.5 text-slate-500">{a.city ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <OrgTypeBadge orgType={a.organizationType} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {practiceAreaData.entries.length > 0 ? (
                      <div className="space-y-0.5">
                        {practiceAreaData.entries.map((entry, index) => (
                          <p key={`${entry.area}-${index}`}>
                            {entry.area}
                            {entry.percent !== undefined
                              ? ` · ${entry.percent}%`
                              : ""}
                          </p>
                        ))}
                        {practiceAreaData.incomplete && (
                          <p className="font-medium text-amber-700">
                            Incomplete imported data
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {isWithdrawn ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        Withdrawn
                      </span>
                    ) : a.blocks.length > 0 ? (
                      <UnavailabilityPopover blocks={a.blocks} />
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {a.resumePath ? (
                      <a
                        href={`/api/attorneys/${a.id}/resume`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        View PDF
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setManagingId(a.id)}
                    >
                      Manage
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-500">
            No attorneys match your search.
          </p>
        )}
      </div>

      {managing && (
        <AttorneyManageDialog
          eventId={eventId}
          attorney={managing}
          days={days}
          slots={slots}
          open
          onOpenChange={(open) => !open && setManagingId(null)}
        />
      )}
    </div>
  );
}
