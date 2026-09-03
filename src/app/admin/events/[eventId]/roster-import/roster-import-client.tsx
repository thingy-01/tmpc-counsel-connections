"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApplyDecision, ColumnMapping, PercentFormat, ValidatedCandidate } from "@/lib/roster-import/types";

type Inspection = {
  sheetName: string;
  headers: string[];
  rowCount: number;
  suggestedMapping: ColumnMapping;
  suggestedPercentFormat: PercentFormat;
  percentExample: { rowNumber: number; raw: string; stored: number } | null;
};

type Preview = {
  importId: string;
  candidates: Array<ValidatedCandidate & { candidateId: string }>;
  attorneys: Array<{ id: string; firstName: string; lastName: string; firm: string; email: string }>;
};

const fields: Array<{ key: keyof ColumnMapping; label: string; required?: boolean }> = [
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name", required: true },
  { key: "email", label: "Email" },
  { key: "firm", label: "Firm", required: true },
  { key: "city", label: "City" },
  { key: "organizationType", label: "Organization type" },
  { key: "practiceArea", label: "Practice area", required: true },
  { key: "percent", label: "Percent of practice", required: true },
  { key: "partnerCount", label: "Partners" },
  { key: "associateCount", label: "Associates" },
  { key: "ofCounselCount", label: "Of counsel" },
  { key: "resumeReference", label: "Resume reference URL" },
];

async function responseJson<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? "Request failed.");
  return value;
}

export default function RosterImportClient({ eventId }: { eventId: string }) {
  const endpoint = `/admin/events/${eventId}/roster-import/api`;
  const [roster, setRoster] = useState<File | null>(null);
  const [companion, setCompanion] = useState<File | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [companionInspection, setCompanionInspection] = useState<Inspection | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [companionMapping, setCompanionMapping] = useState<ColumnMapping>({});
  const [percentFormat, setPercentFormat] = useState<PercentFormat>("whole");
  const [useCompanion, setUseCompanion] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ApplyDecision>>({});
  const [correctionEmails, setCorrectionEmails] = useState<Record<string, string>>({});
  const [manualMatches, setManualMatches] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const blockers = useMemo(() => preview?.candidates.filter((candidate) => ["needs_email", "ambiguous", "error"].includes(candidate.resolution)).length ?? 0, [preview]);

  async function inspect(file: File, isCompanion = false) {
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("action", "inspect");
      form.set("roster", file);
      const result = await responseJson<Inspection>(await fetch(endpoint, { method: "POST", body: form }));
      if (isCompanion) {
        setCompanionInspection(result);
        setCompanionMapping(result.suggestedMapping);
      } else {
        setInspection(result);
        setMapping(result.suggestedMapping);
        setPercentFormat(result.suggestedPercentFormat);
        setPreview(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inspection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function stage() {
    if (!roster) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("action", "stage");
      form.set("roster", roster);
      form.set("mapping", JSON.stringify(mapping));
      form.set("percentFormat", percentFormat);
      form.set("useCompanion", String(useCompanion));
      if (useCompanion && companion) {
        form.set("companion", companion);
        form.set("companionMapping", JSON.stringify(companionMapping));
      }
      const result = await responseJson<Preview>(await fetch(endpoint, { method: "POST", body: form }));
      setPreview(result);
      setDecisions(Object.fromEntries(result.candidates.map((candidate) => [candidate.candidateId, candidate.resolution === "create" ? "create" : candidate.resolution === "update" ? "update" : "skip"])));
      setMessage(`Server preview validated ${result.candidates.length} attorney candidates.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function correct(candidateId: string) {
    if (!preview) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await responseJson<Preview>(await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "correct",
          importId: preview.importId,
          candidateId,
          correctedEmail: correctionEmails[candidateId] || undefined,
          manualAttorneyId: manualMatches[candidateId] || undefined,
        }),
      }));
      setPreview(result);
      setDecisions(Object.fromEntries(result.candidates.map((candidate) => [candidate.candidateId, candidate.resolution === "create" ? "create" : candidate.resolution === "update" ? "update" : "skip"])));
      setMessage("Correction revalidated on the server.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Correction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!preview) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await responseJson<Record<string, number>>(await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          importId: preview.importId,
          decisions: preview.candidates.map((candidate) => ({ candidateId: candidate.candidateId, decision: decisions[candidate.candidateId] })),
          corrections: preview.candidates.flatMap((candidate) => correctionEmails[candidate.candidateId] ? [{ candidateId: candidate.candidateId, correctedEmail: correctionEmails[candidate.candidateId] }] : []),
        }),
      }));
      setMessage(`Applied: ${result.created ?? 0} created, ${result.updated ?? 0} updated, ${result.unchanged ?? 0} unchanged, ${result.skipped ?? 0} skipped, ${result.failed ?? 0} conflicts.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Apply failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold text-slate-900">1. Upload and inspect</h2>
        <p className="mt-1 text-sm text-slate-500">Accepted: .xlsx or .csv, up to 5 MB and 5,000 rows. Formula cells are never evaluated.</p>
        <input className="mt-3 block text-sm" type="file" accept=".xlsx,.csv" onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          setRoster(file);
          if (file) void inspect(file);
        }} />
      </section>

      {inspection && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold text-slate-900">2. Map columns</h2>
          <p className="mt-1 text-sm text-slate-500">{inspection.sheetName} · {inspection.rowCount} source rows</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((field) => (
              <label key={field.key} className="text-sm text-slate-700">{field.label}{field.required ? " *" : ""}
                <select className="mt-1 block w-full rounded border px-2 py-1.5" value={mapping[field.key] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value || undefined }))}>
                  <option value="">Not mapped</option>
                  {inspection.headers.map((header) => <option key={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
          <fieldset className="mt-5 rounded border border-amber-200 bg-amber-50 p-3">
            <legend className="px-1 text-sm font-semibold text-amber-900">Required percentage-format confirmation</legend>
            <label className="mr-5 text-sm"><input type="radio" checked={percentFormat === "fraction"} onChange={() => setPercentFormat("fraction")} /> Fraction (0.5 means 50%)</label>
            <label className="text-sm"><input type="radio" checked={percentFormat === "whole"} onChange={() => setPercentFormat("whole")} /> Whole (50 means 50%)</label>
            <p className="mt-2 text-sm text-amber-900">
              {inspection.percentExample ? `${inspection.percentExample.raw} in row ${inspection.percentExample.rowNumber} will be stored as ${inspection.percentExample.stored}%.` : "Review the mapped percentage column and confirm its scale."}
            </p>
          </fieldset>
          <div className="mt-5 rounded border p-3">
            <label className="text-sm font-medium"><input type="checkbox" checked={useCompanion} onChange={(event) => setUseCompanion(event.target.checked)} /> Join emails from a companion workbook</label>
            <p className="mt-1 text-xs text-slate-500">The join uses normalized first name, last name, and firm only when you explicitly enable it.</p>
            {useCompanion && <input className="mt-2 block text-sm" type="file" accept=".xlsx,.csv" onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setCompanion(file);
              if (file) void inspect(file, true);
            }} />}
            {useCompanion && companionInspection && (
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                {(["firstName", "lastName", "firm", "email"] as const).map((key) => (
                  <label key={key} className="text-xs">{key}<select className="mt-1 block w-full rounded border px-2 py-1" value={companionMapping[key] ?? ""} onChange={(event) => setCompanionMapping((current) => ({ ...current, [key]: event.target.value || undefined }))}><option value="">Not mapped</option>{companionInspection.headers.map((header) => <option key={header}>{header}</option>)}</select></label>
                ))}
              </div>
            )}
          </div>
          <Button className="mt-4" onClick={() => void stage()} disabled={busy}>{busy ? "Validating…" : "Create server-validated preview"}</Button>
        </section>
      )}

      {preview && (
        <section className="rounded-lg border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold text-slate-900">3. Correct and decide</h2><p className="text-sm text-slate-500">{preview.candidates.length} candidates · {blockers} need correction or skip</p></div><Button onClick={() => void apply()} disabled={busy}>{busy ? "Applying…" : "Apply explicit decisions"}</Button></div>
          <div className="mt-4 space-y-3">
            {preview.candidates.map((candidate) => (
              <article key={candidate.candidateId} className="rounded border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">{candidate.parsed.firstName} {candidate.parsed.lastName} · {candidate.parsed.firm}</h3><p className="text-sm text-slate-500">{candidate.resolvedEmail ?? "Email needed"} · {candidate.matchMethod === "name_firm" ? "Proposed name/firm match — choose update to accept" : candidate.matchMethod}</p></div><select className="rounded border px-2 py-1 text-sm" value={decisions[candidate.candidateId] ?? "skip"} onChange={(event) => setDecisions((current) => ({ ...current, [candidate.candidateId]: event.target.value as ApplyDecision }))}><option value="create">Create</option><option value="update">Accept match and update</option><option value="skip">Skip</option></select></div>
                <p className="mt-2 text-xs text-slate-600">{candidate.parsed.practiceAreas.map((entry) => `${entry.area}${entry.percent === undefined ? " (missing %)" : ` (${entry.percent}%)`}`).join(" · ")}</p>
                {candidate.issues.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">{candidate.issues.map((issue) => <li key={`${issue.code}-${issue.message}`}>{issue.code}: {issue.message}</li>)}</ul>}
                {(["needs_email", "ambiguous", "error"].includes(candidate.resolution) || candidate.matchMethod === "none") && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input className="rounded border px-2 py-1 text-sm" type="email" placeholder="Correct email" value={correctionEmails[candidate.candidateId] ?? ""} onChange={(event) => setCorrectionEmails((current) => ({ ...current, [candidate.candidateId]: event.target.value }))} /><select className="rounded border px-2 py-1 text-sm" value={manualMatches[candidate.candidateId] ?? ""} onChange={(event) => setManualMatches((current) => ({ ...current, [candidate.candidateId]: event.target.value }))}><option value="">No manual target</option>{preview.attorneys.map((attorney) => <option key={attorney.id} value={attorney.id}>{attorney.firstName} {attorney.lastName} · {attorney.firm} · {attorney.email}</option>)}</select><Button variant="outline" size="sm" onClick={() => void correct(candidate.candidateId)} disabled={busy}>Revalidate</Button></div>}
                {candidate.parsed.resumeReferences.map((reference) => <a key={reference.url} href={reference.url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-xs font-medium text-blue-600 hover:underline">Unverified external reference</a>)}
              </article>
            ))}
          </div>
        </section>
      )}
      {message && <p role="status" className="rounded border bg-slate-50 p-3 text-sm">{message}</p>}
    </div>
  );
}
