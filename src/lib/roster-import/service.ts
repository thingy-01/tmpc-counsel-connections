import { createHash } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { parsePracticeAreas, practiceAreaEntriesEqual } from "@/lib/practice-areas";
import {
  attorneyResumeReferences,
  attorneys,
  events,
  rosterImportCandidates,
  rosterImportRows,
  rosterImports,
} from "@/lib/db/schema";
import { firstValidEmail, identityKey, isValidEmail, normalizeEmail } from "./normalize";
import type {
  ApplyDecision,
  CandidateOverrides,
  ColumnMapping,
  ExistingAttorney,
  PercentFormat,
  StoredRow,
  ValidatedCandidate,
} from "./types";
import { validateRosterCandidates } from "./validator";
import type { WorkbookInspection } from "./workbook";

type StoredCandidateParsed = ValidatedCandidate["parsed"];

export type PreviewResponse = {
  importId: string;
  candidates: Array<ValidatedCandidate & { candidateId: string }>;
  attorneys: Array<Pick<ExistingAttorney, "id" | "firstName" | "lastName" | "firm" | "email">>;
};

async function assertEvent(eventId: string): Promise<void> {
  const rows = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!rows[0]) throw new Error("Event not found.");
}

async function eventAttorneys(eventId: string): Promise<ExistingAttorney[]> {
  return db
    .select({
      id: attorneys.id,
      firstName: attorneys.firstName,
      lastName: attorneys.lastName,
      email: attorneys.email,
      firm: attorneys.firm,
      city: attorneys.city,
      organizationType: attorneys.organizationType,
      practiceAreas: attorneys.practiceAreas,
      partnerCount: attorneys.partnerCount,
      associateCount: attorneys.associateCount,
      ofCounselCount: attorneys.ofCounselCount,
      status: attorneys.status,
      updatedAt: attorneys.updatedAt,
    })
    .from(attorneys)
    .where(eq(attorneys.eventId, eventId))
    .orderBy(asc(attorneys.lastName), asc(attorneys.firstName));
}

function companionEmailMap(
  companion: WorkbookInspection | null,
  mapping: ColumnMapping | null
): Record<string, string> {
  if (!companion || !mapping) return {};
  if (!mapping.firstName || !mapping.lastName || !mapping.firm || !mapping.email) {
    throw new Error("Companion mapping requires first name, last name, firm, and email.");
  }
  const found = new Map<string, Set<string>>();
  for (const row of companion.rows) {
    const firstName = row.raw[mapping.firstName]?.text ?? "";
    const lastName = row.raw[mapping.lastName]?.text ?? "";
    const firm = row.raw[mapping.firm]?.text ?? "";
    const email = row.raw[mapping.email]?.text ?? "";
    const resolvedEmail = firstValidEmail(email);
    if (!firstName || !lastName || !firm || !resolvedEmail) continue;
    const key = identityKey(firstName, lastName, firm);
    const emails = found.get(key) ?? new Set<string>();
    emails.add(resolvedEmail);
    found.set(key, emails);
  }
  return Object.fromEntries(
    [...found.entries()]
      .filter(([, emails]) => emails.size === 1)
      .map(([key, emails]) => [key, [...emails][0]])
  );
}

function requireCoreMapping(mapping: ColumnMapping): void {
  for (const field of ["firstName", "lastName", "firm", "practiceArea", "percent"] as const) {
    if (!mapping[field]) throw new Error(`Map the ${field} column before previewing.`);
  }
}

async function writePreviewCandidates(
  importId: string,
  candidates: ValidatedCandidate[],
  existingIds?: Map<string, string>
): Promise<Array<ValidatedCandidate & { candidateId: string }>> {
  const output: Array<ValidatedCandidate & { candidateId: string }> = [];
  for (const candidate of candidates) {
    const existingId = existingIds?.get(candidate.identityKey);
    let id = existingId;
    if (existingId) {
      await db
        .update(rosterImportCandidates)
        .set({
          parsed: candidate.parsed,
          joinedEmail: candidate.joinedEmail,
          emailSource: candidate.emailSource,
          resolvedEmail: candidate.resolvedEmail,
          matchAttorneyId: candidate.matchAttorneyId,
          matchMethod: candidate.matchMethod,
          resolution: candidate.resolution,
          issues: candidate.issues,
          appliedAction: null,
          appliedAttorneyId: null,
          appliedError: null,
          appliedAt: null,
        })
        .where(and(eq(rosterImportCandidates.id, existingId), eq(rosterImportCandidates.importId, importId)));
    } else {
      const inserted = await db
        .insert(rosterImportCandidates)
        .values({
          importId,
          identityKey: candidate.identityKey,
          parsed: candidate.parsed,
          joinedEmail: candidate.joinedEmail,
          emailSource: candidate.emailSource,
          resolvedEmail: candidate.resolvedEmail,
          matchAttorneyId: candidate.matchAttorneyId,
          matchMethod: candidate.matchMethod,
          resolution: candidate.resolution,
          issues: candidate.issues,
        })
        .returning({ id: rosterImportCandidates.id });
      id = inserted[0]?.id;
    }
    if (!id) throw new Error("Failed to persist a roster candidate.");
    output.push({ ...candidate, candidateId: id });
  }
  return output;
}

export async function stageRosterPreview(input: {
  eventId: string;
  uploadedBy: string;
  filename: string;
  fileBytes: Buffer;
  inspection: WorkbookInspection;
  mapping: ColumnMapping;
  percentFormat: PercentFormat;
  companion: WorkbookInspection | null;
  companionMapping: ColumnMapping | null;
}): Promise<PreviewResponse> {
  await assertEvent(input.eventId);
  requireCoreMapping(input.mapping);
  const existing = await eventAttorneys(input.eventId);
  const joinedEmails = companionEmailMap(input.companion, input.companionMapping);
  const validated = validateRosterCandidates({
    rows: input.inspection.rows,
    mapping: input.mapping,
    percentFormat: input.percentFormat,
    existingAttorneys: existing,
    joinedEmails,
  });
  const inserted = await db
    .insert(rosterImports)
    .values({
      eventId: input.eventId,
      uploadedBy: input.uploadedBy,
      originalFilename: input.filename,
      sheetName: input.inspection.sheetName,
      fileSha256: createHash("sha256").update(input.fileBytes).digest("hex"),
      columnMapping: input.mapping,
      percentFormat: input.percentFormat,
      status: "draft",
      sourceRowCount: input.inspection.rows.length,
    })
    .returning({ id: rosterImports.id });
  const importId = inserted[0]?.id;
  if (!importId) throw new Error("Failed to create the import audit record.");

  const candidates = await writePreviewCandidates(importId, validated);
  const candidateIds = new Map(candidates.map((candidate) => [candidate.identityKey, candidate.candidateId]));
  for (const row of input.inspection.rows) {
    const key = identityKey(
      input.mapping.firstName ? row.raw[input.mapping.firstName]?.text ?? "" : "",
      input.mapping.lastName ? row.raw[input.mapping.lastName]?.text ?? "" : "",
      input.mapping.firm ? row.raw[input.mapping.firm]?.text ?? "" : ""
    );
    await db.insert(rosterImportRows).values({
      importId,
      rowNumber: row.rowNumber,
      raw: row.raw,
      candidateId: candidateIds.get(key) ?? null,
    });
  }
  await db.update(rosterImports).set({ status: "previewed" }).where(eq(rosterImports.id, importId));
  return {
    importId,
    candidates,
    attorneys: existing.map(({ id, firstName, lastName, firm, email }) => ({ id, firstName, lastName, firm, email })),
  };
}

async function readImport(eventId: string, importId: string) {
  const imports = await db
    .select()
    .from(rosterImports)
    .where(and(eq(rosterImports.id, importId), eq(rosterImports.eventId, eventId)))
    .limit(1);
  const rosterImport = imports[0];
  if (!rosterImport) throw new Error("Import not found for this event.");
  const [rows, storedCandidates, existing] = await Promise.all([
    db.select().from(rosterImportRows).where(eq(rosterImportRows.importId, importId)).orderBy(asc(rosterImportRows.rowNumber)),
    db.select().from(rosterImportCandidates).where(eq(rosterImportCandidates.importId, importId)),
    eventAttorneys(eventId),
  ]);
  return { rosterImport, rows, storedCandidates, existing };
}

function storedOverrides(storedCandidates: Awaited<ReturnType<typeof readImport>>["storedCandidates"]): CandidateOverrides {
  return Object.fromEntries(storedCandidates.map((candidate) => [candidate.identityKey, {
    ...(candidate.emailSource === "manual" ? { correctedEmail: candidate.resolvedEmail } : {}),
    ...(candidate.matchMethod === "manual" ? { manualAttorneyId: candidate.matchAttorneyId } : {}),
  }]));
}

function joinedEmailRecord(storedCandidates: Awaited<ReturnType<typeof readImport>>["storedCandidates"]): Record<string, string> {
  return Object.fromEntries(storedCandidates.flatMap((candidate) => candidate.joinedEmail ? [[candidate.identityKey, candidate.joinedEmail]] : []));
}

function mappingFromUnknown(value: unknown): ColumnMapping {
  if (!value || typeof value !== "object") throw new Error("Stored column mapping is invalid.");
  return value as ColumnMapping;
}

function formatFromUnknown(value: string): PercentFormat {
  if (value !== "fraction" && value !== "whole") throw new Error("Stored percentage format is invalid.");
  return value;
}

export async function correctRosterPreview(input: {
  eventId: string;
  importId: string;
  candidateId: string;
  correctedEmail?: string | null;
  manualAttorneyId?: string | null;
}): Promise<PreviewResponse> {
  const state = await readImport(input.eventId, input.importId);
  const target = state.storedCandidates.find((candidate) => candidate.id === input.candidateId);
  if (!target) throw new Error("Candidate not found in this import.");
  const successfulActions = new Set(["created", "updated", "unchanged"]);
  if (target.appliedAction && successfulActions.has(target.appliedAction)) {
    throw new Error("A successfully applied candidate cannot be corrected.");
  }
  if (input.correctedEmail && !isValidEmail(input.correctedEmail)) throw new Error("Corrected email is invalid.");
  if (input.manualAttorneyId && !state.existing.some((attorney) => attorney.id === input.manualAttorneyId)) {
    throw new Error("Manual match is not an attorney in this event.");
  }
  const overrides = storedOverrides(state.storedCandidates);
  overrides[target.identityKey] = {
    correctedEmail: input.correctedEmail === undefined ? overrides[target.identityKey]?.correctedEmail : input.correctedEmail,
    manualAttorneyId: input.manualAttorneyId === undefined ? overrides[target.identityKey]?.manualAttorneyId : input.manualAttorneyId,
  };
  const validated = validateRosterCandidates({
    rows: state.rows.map((row) => ({ rowNumber: row.rowNumber, raw: row.raw as StoredRow })),
    mapping: mappingFromUnknown(state.rosterImport.columnMapping),
    percentFormat: formatFromUnknown(state.rosterImport.percentFormat),
    existingAttorneys: state.existing,
    joinedEmails: joinedEmailRecord(state.storedCandidates),
    overrides,
  });
  const ids = new Map(state.storedCandidates.map((candidate) => [candidate.identityKey, candidate.id]));
  const mutable = validated.filter((candidate) => {
    const stored = state.storedCandidates.find((item) => item.identityKey === candidate.identityKey);
    return !stored?.appliedAction || !successfulActions.has(stored.appliedAction);
  });
  const changed = await writePreviewCandidates(input.importId, mutable, ids);
  const changedByKey = new Map(changed.map((candidate) => [candidate.identityKey, candidate]));
  const candidates = state.storedCandidates.map((stored) => changedByKey.get(stored.identityKey) ?? {
    candidateId: stored.id,
    identityKey: stored.identityKey,
    parsed: stored.parsed as StoredCandidateParsed,
    joinedEmail: stored.joinedEmail,
    emailSource: stored.emailSource as ValidatedCandidate["emailSource"],
    resolvedEmail: stored.resolvedEmail,
    matchAttorneyId: stored.matchAttorneyId,
    matchMethod: stored.matchMethod as ValidatedCandidate["matchMethod"],
    resolution: stored.resolution as ValidatedCandidate["resolution"],
    issues: stored.issues as ValidatedCandidate["issues"],
  });
  await db.update(rosterImports).set({ status: "previewed", appliedAt: null }).where(and(eq(rosterImports.id, input.importId), eq(rosterImports.eventId, input.eventId)));
  return {
    importId: input.importId,
    candidates,
    attorneys: state.existing.map(({ id, firstName, lastName, firm, email }) => ({ id, firstName, lastName, firm, email })),
  };
}

function samePracticeAreas(existing: ExistingAttorney, parsed: StoredCandidateParsed): boolean {
  return practiceAreaEntriesEqual(
    parsePracticeAreas(existing.practiceAreas, { percentageFormat: "auto" }).entries,
    parsePracticeAreas(parsed.practiceAreas, { percentageFormat: "auto" }).entries
  );
}

function sameImportedFields(existing: ExistingAttorney, parsed: StoredCandidateParsed): boolean {
  return (
    existing.firstName === parsed.firstName &&
    existing.lastName === parsed.lastName &&
    existing.firm === parsed.firm &&
    existing.city === parsed.city &&
    existing.organizationType === parsed.organizationType &&
    samePracticeAreas(existing, parsed) &&
    existing.partnerCount === parsed.partnerCount &&
    existing.associateCount === parsed.associateCount &&
    existing.ofCounselCount === parsed.ofCounselCount
  );
}

export type ApplySummary = { created: number; updated: number; unchanged: number; skipped: number; raced: number; failed: number };

async function recordOutcome(candidateId: string, values: {
  action: string;
  attorneyId?: string | null;
  error?: string | null;
}): Promise<void> {
  await db.update(rosterImportCandidates).set({
    appliedAction: values.action,
    appliedAttorneyId: values.attorneyId ?? null,
    appliedError: values.error ?? null,
    appliedAt: new Date(),
  }).where(eq(rosterImportCandidates.id, candidateId));
}

async function addReferences(candidate: ValidatedCandidate, attorneyId: string, importId: string, uploadedBy: string): Promise<void> {
  for (const reference of candidate.parsed.resumeReferences) {
    await db.insert(attorneyResumeReferences).values({
      attorneyId,
      url: reference.url,
      label: reference.label,
      source: "import",
      importId,
      addedBy: uploadedBy,
      status: "unverified",
    }).onConflictDoNothing();
  }
}

export async function applyRosterImport(input: {
  eventId: string;
  importId: string;
  decisions: Array<{ candidateId: string; decision: ApplyDecision }>;
  corrections?: Array<{ candidateId: string; correctedEmail: string }>;
}): Promise<ApplySummary> {
  const state = await readImport(input.eventId, input.importId);
  const validDecisions = new Set<ApplyDecision>(["create", "update", "skip"]);
  const decisionIds = new Set<string>();
  for (const item of input.decisions) {
    if (!validDecisions.has(item.decision) || decisionIds.has(item.candidateId)) throw new Error("Apply decisions are invalid or duplicated.");
    decisionIds.add(item.candidateId);
  }
  if (decisionIds.size !== state.storedCandidates.length || state.storedCandidates.some((candidate) => !decisionIds.has(candidate.id))) {
    throw new Error("Apply decisions must contain exactly this import's candidates.");
  }
  const corrections = new Map<string, string>();
  for (const correction of input.corrections ?? []) {
    if (!state.storedCandidates.some((candidate) => candidate.id === correction.candidateId)) throw new Error("A correction belongs to another import.");
    if (!isValidEmail(correction.correctedEmail)) throw new Error("A corrected email is invalid.");
    corrections.set(correction.candidateId, normalizeEmail(correction.correctedEmail));
  }
  for (const stored of state.storedCandidates) {
    const submitted = corrections.get(stored.id);
    if (submitted && submitted !== stored.resolvedEmail) throw new Error("A correction changed after preview; preview it again before apply.");
    const decision = input.decisions.find((item) => item.candidateId === stored.id)?.decision;
    if (decision !== "skip" && ["needs_email", "ambiguous", "error"].includes(stored.resolution)) {
      throw new Error("Blocked candidates must be corrected or skipped before apply.");
    }
  }

  const summary: ApplySummary = { created: 0, updated: 0, unchanged: 0, skipped: 0, raced: 0, failed: 0 };
  const recomputed = validateRosterCandidates({
    rows: state.rows.map((row) => ({ rowNumber: row.rowNumber, raw: row.raw as StoredRow })),
    mapping: mappingFromUnknown(state.rosterImport.columnMapping),
    percentFormat: formatFromUnknown(state.rosterImport.percentFormat),
    existingAttorneys: state.existing,
    joinedEmails: joinedEmailRecord(state.storedCandidates),
    overrides: storedOverrides(state.storedCandidates),
  });
  const recomputedByKey = new Map(recomputed.map((candidate) => [candidate.identityKey, candidate]));

  for (const stored of state.storedCandidates) {
    const decision = input.decisions.find((item) => item.candidateId === stored.id)?.decision;
    if (["created", "updated", "unchanged"].includes(stored.appliedAction ?? "")) {
      summary.unchanged += 1;
      continue;
    }
    if (decision === "skip") {
      await recordOutcome(stored.id, { action: "skipped" });
      summary.skipped += 1;
      continue;
    }
    const candidate = recomputedByKey.get(stored.identityKey);
    const preview = stored.parsed as StoredCandidateParsed;
    if (!candidate || candidate.parsed.previewFingerprint !== preview.previewFingerprint || candidate.matchAttorneyId !== stored.matchAttorneyId || candidate.matchMethod !== stored.matchMethod) {
      await recordOutcome(stored.id, { action: "failed", error: "Stale preview: event attorney data changed. Preview again before applying this candidate." });
      summary.failed += 1;
      continue;
    }
    try {
      if (decision === "create") {
        if (candidate.matchAttorneyId || candidate.resolution !== "create" || !candidate.resolvedEmail) throw new Error("Server validation does not authorize create.");
        const inserted = await db.insert(attorneys).values({
          eventId: input.eventId,
          firstName: candidate.parsed.firstName,
          lastName: candidate.parsed.lastName,
          email: candidate.resolvedEmail,
          firm: candidate.parsed.firm,
          city: candidate.parsed.city,
          organizationType: candidate.parsed.organizationType,
          practiceAreas: candidate.parsed.practiceAreas,
          partnerCount: candidate.parsed.partnerCount,
          associateCount: candidate.parsed.associateCount,
          ofCounselCount: candidate.parsed.ofCounselCount,
          updatedAt: new Date(),
        }).onConflictDoNothing({ target: [attorneys.eventId, attorneys.email] }).returning({ id: attorneys.id });
        const attorneyId = inserted[0]?.id;
        if (!attorneyId) {
          await recordOutcome(stored.id, { action: "raced", error: "Another process created this event email first." });
          summary.raced += 1;
        } else {
          await addReferences(candidate, attorneyId, input.importId, state.rosterImport.uploadedBy);
          await recordOutcome(stored.id, { action: "created", attorneyId });
          summary.created += 1;
        }
      } else if (decision === "update") {
        if (!candidate.matchAttorneyId || candidate.resolution !== "update") throw new Error("Server validation does not authorize update.");
        const current = state.existing.find((attorney) => attorney.id === candidate.matchAttorneyId);
        if (!current) throw new Error("Matched attorney no longer exists.");
        if (sameImportedFields(current, candidate.parsed)) {
          await addReferences(candidate, current.id, input.importId, state.rosterImport.uploadedBy);
          await recordOutcome(stored.id, { action: "unchanged", attorneyId: current.id });
          summary.unchanged += 1;
        } else {
          const preserveLegacyPracticeAreas = samePracticeAreas(current, candidate.parsed);
          const updated = await db.update(attorneys).set({
            firstName: candidate.parsed.firstName,
            lastName: candidate.parsed.lastName,
            firm: candidate.parsed.firm,
            city: candidate.parsed.city,
            organizationType: candidate.parsed.organizationType,
            ...(!preserveLegacyPracticeAreas
              ? { practiceAreas: candidate.parsed.practiceAreas }
              : {}),
            partnerCount: candidate.parsed.partnerCount,
            associateCount: candidate.parsed.associateCount,
            ofCounselCount: candidate.parsed.ofCounselCount,
            updatedAt: new Date(),
          }).where(and(
            eq(attorneys.id, current.id),
            eq(attorneys.eventId, input.eventId),
            eq(attorneys.firstName, current.firstName),
            eq(attorneys.lastName, current.lastName),
            eq(attorneys.email, current.email),
            eq(attorneys.firm, current.firm),
            current.city === null ? isNull(attorneys.city) : eq(attorneys.city, current.city),
            current.organizationType === null
              ? isNull(attorneys.organizationType)
              : eq(attorneys.organizationType, current.organizationType),
            sql`${attorneys.practiceAreas} is not distinct from ${JSON.stringify(current.practiceAreas ?? [])}::jsonb`,
            current.partnerCount === null ? isNull(attorneys.partnerCount) : eq(attorneys.partnerCount, current.partnerCount),
            current.associateCount === null ? isNull(attorneys.associateCount) : eq(attorneys.associateCount, current.associateCount),
            current.ofCounselCount === null ? isNull(attorneys.ofCounselCount) : eq(attorneys.ofCounselCount, current.ofCounselCount),
            eq(attorneys.status, current.status)
          )).returning({ id: attorneys.id });
          if (!updated[0]) throw new Error("Matched attorney changed or disappeared before update.");
          await addReferences(candidate, current.id, input.importId, state.rosterImport.uploadedBy);
          await recordOutcome(stored.id, { action: "updated", attorneyId: current.id });
          summary.updated += 1;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Candidate apply failed.";
      await recordOutcome(stored.id, { action: "failed", error: message.slice(0, 500) });
      summary.failed += 1;
    }
  }
  await db.update(rosterImports).set({ status: "applied", appliedAt: new Date() }).where(and(eq(rosterImports.id, input.importId), eq(rosterImports.eventId, input.eventId)));
  return summary;
}
