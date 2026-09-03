"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type UnavailabilityBlock = {
  id: string;
  /** Human-readable label, e.g. "Mon Oct 6 · 9:00 AM – 9:15 AM" or "Tue Oct 7 (all day)". */
  label: string;
  note: string | null;
  timeSlotId: string | null;
  eventDayId: string | null;
};

export type PickableAttorney = {
  id: string;
  firstName: string;
  lastName: string;
  firm: string;
  status: string; // active | withdrawn
  blocks: UnavailabilityBlock[];
};

/** Company-safe attorney data: no block rows, reasons, notes, or raw files. */
export type CompanyPickableAttorney = {
  id: string;
  firstName: string;
  lastName: string;
  firm: string;
  city: string | null;
  organizationType: string | null;
  practiceAreas: Array<{ area: string; percent: number | null }>;
  status: "active" | "withdrawn";
  hasResume: boolean;
  unavailableSlotIds: string[];
};

/**
 * A small red badge that reveals an attorney's specific unavailable times on click.
 * Reused in the admin roster and anywhere attorneys are listed.
 */
export function UnavailabilityPopover({
  blocks,
  label = "Unavailable",
}: {
  blocks: UnavailabilityBlock[];
  label?: string;
}) {
  if (blocks.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-200"
        >
          <AlertTriangle className="size-3" />
          {label} ({blocks.length})
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <p className="mb-2 text-xs font-semibold text-slate-700">
          Unavailable times
        </p>
        <ul className="space-y-1.5">
          {blocks.map((b) => (
            <li key={b.id} className="text-xs text-slate-600">
              <span className="font-medium text-slate-800">{b.label}</span>
              {b.note && <span className="text-slate-500"> — {b.note}</span>}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Availability-aware attorney selection list.
 *
 * - Withdrawn attorneys are excluded entirely.
 * - When a `slotId`/`dayId` context is given, attorneys blocked for that time are
 *   disabled and flagged with a warning popover.
 * - Without a slot context, blocked attorneys remain selectable but show their blocks.
 *
 * Reusable for any future slot-level attorney assignment UI.
 */
export function AttorneyPicker({
  attorneys,
  slotId,
  dayId,
  value,
  onSelect,
}: {
  attorneys: PickableAttorney[];
  slotId?: string;
  dayId?: string;
  value?: string | null;
  onSelect?: (attorneyId: string) => void;
}) {
  const [query, setQuery] = useState("");

  const selectable = useMemo(
    () => attorneys.filter((a) => a.status !== "withdrawn"),
    [attorneys]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return selectable;
    return selectable.filter(
      (a) =>
        `${a.firstName} ${a.lastName}`.toLowerCase().includes(q) ||
        a.firm.toLowerCase().includes(q)
    );
  }, [selectable, query]);

  function blockedFor(a: PickableAttorney): UnavailabilityBlock[] {
    if (!slotId && !dayId) return [];
    return a.blocks.filter(
      (b) =>
        (slotId && b.timeSlotId === slotId) ||
        (dayId && b.eventDayId === dayId)
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search attorneys…"
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
      <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
        {filtered.map((a) => {
          const conflicts = blockedFor(a);
          const disabled = conflicts.length > 0;
          const selected = value === a.id;
          return (
            <li key={a.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect?.(a.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                  disabled
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-slate-50",
                  selected && "bg-emerald-50"
                )}
              >
                <span>
                  <span className="font-medium text-slate-800">
                    {a.firstName} {a.lastName}
                  </span>
                  <span className="ml-2 text-slate-500">{a.firm}</span>
                </span>
                {disabled ? (
                  <UnavailabilityPopover blocks={conflicts} label="Conflict" />
                ) : (
                  a.blocks.length > 0 && (
                    <UnavailabilityPopover blocks={a.blocks} />
                  )
                )}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-slate-500">
            No attorneys found.
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * Company-only picker. Unlike the staff picker above, its availability model is
 * deliberately generic and cannot carry an internal reason or note.
 */
export function CompanyAttorneyPicker({
  attorneys,
  slotId,
  value,
  onSelect,
}: {
  attorneys: CompanyPickableAttorney[];
  slotId: string;
  value?: string | null;
  onSelect?: (attorneyId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return attorneys.filter((attorney) => {
      const searchable = [
        attorney.firstName,
        attorney.lastName,
        attorney.firm,
        attorney.city ?? "",
        attorney.organizationType ?? "",
        ...attorney.practiceAreas.map((practice) => practice.area),
      ]
        .join(" ")
        .toLowerCase();
      return !q || searchable.includes(q);
    });
  }, [attorneys, query]);

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter by name, firm, city, organization, or practice…"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
      <div className="max-h-80 divide-y overflow-y-auto rounded-md border bg-white">
        {filtered.map((attorney) => {
          const current = attorney.id === value;
          const unavailable = attorney.unavailableSlotIds.includes(slotId);
          const withdrawn = attorney.status === "withdrawn";
          const disabled = withdrawn || (unavailable && !current);
          return (
            <div
              key={attorney.id}
              className={cn(
                "flex items-start gap-3 p-3",
                current && "bg-emerald-50",
                disabled && "bg-slate-50"
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect?.(attorney.id)}
                className={cn(
                  "min-w-0 flex-1 text-left",
                  disabled ? "cursor-not-allowed opacity-60" : "hover:text-slate-950"
                )}
              >
                <span className="block font-medium text-slate-900">
                  {attorney.firstName} {attorney.lastName}
                </span>
                <span className="block text-sm text-slate-600">
                  {attorney.firm}
                  {attorney.city ? ` · ${attorney.city}` : ""}
                </span>
                {attorney.organizationType && (
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {attorney.organizationType}
                  </span>
                )}
                {attorney.practiceAreas.length > 0 && (
                  <span className="mt-1 block text-xs text-slate-500">
                    {attorney.practiceAreas
                      .map((practice) =>
                        practice.percent === null
                          ? practice.area
                          : `${practice.area} (${practice.percent}%)`
                      )
                      .join(" · ")}
                  </span>
                )}
                {(unavailable || withdrawn) && (
                  <span className="mt-1 block text-xs font-medium text-amber-700">
                    {withdrawn ? "No longer selectable" : "Unavailable this time"}
                  </span>
                )}
              </button>
              {attorney.hasResume && (
                <a
                  href={`/api/attorneys/${attorney.id}/resume`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                >
                  Resume
                </a>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">
            No attorneys match that filter.
          </p>
        )}
      </div>
    </div>
  );
}
