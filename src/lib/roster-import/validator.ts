import { isSafeExternalUrl } from "@/lib/spreadsheet-safe";
import { parsePracticeAreas, serializePracticeAreas } from "@/lib/practice-areas";
import {
  identityKey,
  isValidEmail,
  normalizeEmail,
  normalizeIdentityPart,
  personKey,
  previewFingerprint,
} from "./normalize";
import type {
  CandidateIssue,
  CandidateOverrides,
  ColumnMapping,
  ExistingAttorney,
  ParsedCandidate,
  PercentFormat,
  StoredCell,
  StoredRow,
  ValidatedCandidate,
} from "./types";

export type ValidateRosterInput = {
  rows: Array<{ rowNumber: number; raw: StoredRow }>;
  mapping: ColumnMapping;
  percentFormat: PercentFormat;
  existingAttorneys: ExistingAttorney[];
  joinedEmails?: Record<string, string>;
  overrides?: CandidateOverrides;
};

type Group = {
  identityKey: string;
  firstName: string;
  lastName: string;
  firm: string;
  rows: Array<{ rowNumber: number; raw: StoredRow }>;
};

function cell(row: StoredRow, mapping: ColumnMapping, field: keyof ColumnMapping): StoredCell {
  const header = mapping[field];
  return header ? row[header] ?? { text: "" } : { text: "" };
}

function firstText(group: Group, mapping: ColumnMapping, field: keyof ColumnMapping): string {
  for (const row of group.rows) {
    const value = cell(row.raw, mapping, field).text;
    if (value) return value;
  }
  return "";
}

function parseCount(value: string): number | null | "invalid" {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return "invalid";
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : "invalid";
}

function percentValue(value: StoredCell, format: PercentFormat): number | undefined {
  if (value.numericValue !== undefined) {
    const parsed = parsePracticeAreas(
      [{ area: "import", percent: value.numericValue }],
      { percentageFormat: format }
    );
    return parsed.entries[0]?.percent;
  }
  const raw = value.text.trim();
  if (!raw) return undefined;
  const hasPercentSymbol = raw.endsWith("%");
  const number = Number(raw.replace(/%$/, "").trim());
  if (!Number.isFinite(number)) return Number.NaN;
  const parsed = parsePracticeAreas([{ area: "import", percent: number }], {
    percentageFormat: hasPercentSymbol ? "whole" : format,
  });
  return parsed.entries[0]?.percent;
}

function addIssue(issues: CandidateIssue[], issue: CandidateIssue): void {
  if (!issues.some((existing) => existing.code === issue.code && existing.message === issue.message)) {
    issues.push(issue);
  }
}

function mappedFormulaRows(group: Group, mapping: ColumnMapping): number[] {
  const headers = new Set(Object.values(mapping).filter((header): header is string => Boolean(header)));
  return group.rows
    .filter((row) => [...headers].some((header) => row.raw[header]?.rejectedFormula))
    .map((row) => row.rowNumber);
}

function mappedTruncatedRows(group: Group, mapping: ColumnMapping): number[] {
  const headers = new Set(Object.values(mapping).filter((header): header is string => Boolean(header)));
  return group.rows
    .filter((row) => [...headers].some((header) => row.raw[header]?.truncated))
    .map((row) => row.rowNumber);
}

/**
 * The single authoritative roster validator. Both preview staging and apply call
 * this exported function with persisted raw rows and current event attorneys.
 */
export function validateRosterCandidates(input: ValidateRosterInput): ValidatedCandidate[] {
  const groups = new Map<string, Group>();
  for (const row of input.rows) {
    const firstName = cell(row.raw, input.mapping, "firstName").text;
    const lastName = cell(row.raw, input.mapping, "lastName").text;
    const firm = cell(row.raw, input.mapping, "firm").text;
    const key = identityKey(firstName, lastName, firm);
    const group = groups.get(key) ?? { identityKey: key, firstName, lastName, firm, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const existingByEmail = new Map<string, ExistingAttorney[]>();
  const existingByIdentity = new Map<string, ExistingAttorney[]>();
  for (const attorney of input.existingAttorneys) {
    const email = normalizeEmail(attorney.email);
    existingByEmail.set(email, [...(existingByEmail.get(email) ?? []), attorney]);
    if (attorney.status === "active") {
      const key = identityKey(attorney.firstName, attorney.lastName, attorney.firm);
      existingByIdentity.set(key, [...(existingByIdentity.get(key) ?? []), attorney]);
    }
  }

  const personCandidates = new Map<string, string[]>();
  for (const group of groups.values()) {
    const key = personKey(group.firstName, group.lastName);
    personCandidates.set(key, [...(personCandidates.get(key) ?? []), group.identityKey]);
  }

  const candidates: ValidatedCandidate[] = [];
  for (const group of groups.values()) {
    const issues: CandidateIssue[] = [];
    const formulaRows = mappedFormulaRows(group, input.mapping);
    if (formulaRows.length) {
      addIssue(issues, { code: "formula_cell", severity: "block", message: "A mapped formula cell was rejected and was not evaluated.", rowNumbers: formulaRows });
    }
    const truncatedRows = mappedTruncatedRows(group, input.mapping);
    if (truncatedRows.length) {
      addIssue(issues, { code: "oversized_cell", severity: "block", message: "A mapped cell exceeded the safe length limit and was rejected.", rowNumbers: truncatedRows });
    }
    if (!group.firstName || !group.lastName) addIssue(issues, { code: "missing_name", severity: "block", message: "First and last name are required." });
    if (!group.firm) addIssue(issues, { code: "missing_firm", severity: "block", message: "Firm is required." });

    const practiceEntries: Array<{ area: string; percent?: number }> = [];
    let invalidPercent = false;
    for (const row of group.rows) {
      const area = cell(row.raw, input.mapping, "practiceArea").text;
      if (!area) continue;
      const percent = percentValue(cell(row.raw, input.mapping, "percent"), input.percentFormat);
      if (percent !== undefined && !Number.isFinite(percent)) invalidPercent = true;
      practiceEntries.push(Number.isFinite(percent) ? { area, percent } : { area });
    }
    const parsedPractice = parsePracticeAreas(practiceEntries, { percentageFormat: "whole" });
    const serializedPractice = serializePracticeAreas(parsedPractice.entries);
    if (invalidPercent) addIssue(issues, { code: "invalid_percent", severity: "warning", message: "At least one percentage is not numeric." });
    if (parsedPractice.hasMissingPercentages) addIssue(issues, { code: "missing_percent", severity: "warning", message: "At least one practice area has no percentage." });
    if (parsedPractice.hasMoreThanTwoAreas) addIssue(issues, { code: "over_two_areas", severity: "warning", message: "This attorney has more than two practice-area rows." });
    if (parsedPractice.hasInvalidPercentageTotal) addIssue(issues, { code: "percent_sum_out_of_range", severity: "warning", message: "Practice-area percentages do not total 100%." });
    const areaCounts = new Map<string, number>();
    for (const entry of parsedPractice.entries) {
      const key = normalizeIdentityPart(entry.area);
      areaCounts.set(key, (areaCounts.get(key) ?? 0) + 1);
    }
    if ([...areaCounts.values()].some((count) => count > 1)) {
      addIssue(issues, { code: "duplicate_area", severity: "warning", message: "A practice area appears more than once; all rows will be preserved." });
    }

    const counts = {
      partnerCount: parseCount(firstText(group, input.mapping, "partnerCount")),
      associateCount: parseCount(firstText(group, input.mapping, "associateCount")),
      ofCounselCount: parseCount(firstText(group, input.mapping, "ofCounselCount")),
    };
    if (Object.values(counts).includes("invalid")) addIssue(issues, { code: "invalid_count", severity: "warning", message: "A staffing count is invalid and will remain blank." });

    const resumeReferences: Array<{ url: string; label: string }> = [];
    let rejectedReference = false;
    for (const row of group.rows) {
      const url = cell(row.raw, input.mapping, "resumeReference").text;
      if (!url) continue;
      if (isSafeExternalUrl(url)) {
        if (!resumeReferences.some((reference) => reference.url === url)) resumeReferences.push({ url, label: "Unverified external resume reference" });
      } else rejectedReference = true;
    }
    if (rejectedReference) addIssue(issues, { code: "unsafe_resume_reference", severity: "warning", message: "An unsafe resume reference was rejected; the server did not contact it." });
    if (resumeReferences.length === 0) addIssue(issues, { code: "missing_resume_reference", severity: "warning", message: "No accepted resume reference was supplied." });

    const fileEmail = firstText(group, input.mapping, "email");
    if (fileEmail && !isValidEmail(fileEmail)) addIssue(issues, { code: "invalid_email", severity: "warning", message: "The mapped email is not syntactically valid." });
    const joinedEmail = input.joinedEmails?.[group.identityKey]?.trim() || null;
    const override = input.overrides?.[group.identityKey];
    const correctedEmail = override?.correctedEmail?.trim() || null;
    const chosen = correctedEmail && isValidEmail(correctedEmail)
      ? { email: normalizeEmail(correctedEmail), source: "manual" as const }
      : fileEmail && isValidEmail(fileEmail)
        ? { email: normalizeEmail(fileEmail), source: "file" as const }
        : joinedEmail && isValidEmail(joinedEmail)
          ? { email: normalizeEmail(joinedEmail), source: "companion_join" as const }
          : { email: null, source: "none" as const };
    if (correctedEmail && !isValidEmail(correctedEmail)) addIssue(issues, { code: "invalid_email", severity: "block", message: "The corrected email is not syntactically valid." });

    let matched: ExistingAttorney | null = null;
    let matchMethod: ValidatedCandidate["matchMethod"] = "none";
    let ambiguous = false;
    if (chosen.email) {
      const emailMatches = existingByEmail.get(chosen.email) ?? [];
      if (emailMatches.length === 1) {
        matched = emailMatches[0];
        matchMethod = "event_email";
      } else if (emailMatches.length > 1) ambiguous = true;
    }
    if (!matched && !ambiguous) {
      const nameMatches = existingByIdentity.get(group.identityKey) ?? [];
      if (nameMatches.length === 1) {
        matched = nameMatches[0];
        matchMethod = "name_firm";
      } else if (nameMatches.length > 1) ambiguous = true;
    }
    if (!matched && !ambiguous && override?.manualAttorneyId) {
      const manual = input.existingAttorneys.find((attorney) => attorney.id === override.manualAttorneyId);
      if (manual) {
        matched = manual;
        matchMethod = "manual";
      } else ambiguous = true;
    }
    if ((personCandidates.get(personKey(group.firstName, group.lastName))?.length ?? 0) > 1) ambiguous = true;

    const parsedWithoutFingerprint = {
      firstName: group.firstName,
      lastName: group.lastName,
      email: chosen.email,
      firm: group.firm,
      city: firstText(group, input.mapping, "city") || null,
      organizationType: firstText(group, input.mapping, "organizationType") || null,
      practiceAreas: serializedPractice,
      partnerCount: counts.partnerCount === "invalid" ? null : counts.partnerCount,
      associateCount: counts.associateCount === "invalid" ? null : counts.associateCount,
      ofCounselCount: counts.ofCounselCount === "invalid" ? null : counts.ofCounselCount,
      resumeReferences,
      sourceRowNumbers: group.rows.map((row) => row.rowNumber),
    } satisfies Omit<ParsedCandidate, "previewFingerprint">;
    const parsed: ParsedCandidate = {
      ...parsedWithoutFingerprint,
      previewFingerprint: previewFingerprint(parsedWithoutFingerprint, matched),
    };
    if (!chosen.email) addIssue(issues, { code: "missing_email", severity: "block", message: "A valid email is required before this candidate can be applied." });
    if (ambiguous) addIssue(issues, { code: "ambiguous_identity", severity: "block", message: "This identity resolves ambiguously and needs staff correction." });
    const structuralError = issues.some((issue) => issue.severity === "block" && !["missing_email", "ambiguous_identity"].includes(issue.code));
    candidates.push({
      identityKey: group.identityKey,
      parsed,
      joinedEmail,
      emailSource: chosen.source,
      resolvedEmail: chosen.email,
      matchAttorneyId: matched?.id ?? null,
      matchMethod,
      resolution: structuralError ? "error" : ambiguous ? "ambiguous" : !chosen.email ? "needs_email" : matched ? "update" : "create",
      issues,
    });
  }

  const byTarget = new Map<string, ValidatedCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.matchAttorneyId) continue;
    byTarget.set(candidate.matchAttorneyId, [...(byTarget.get(candidate.matchAttorneyId) ?? []), candidate]);
  }
  for (const collisions of byTarget.values()) {
    if (collisions.length < 2) continue;
    for (const candidate of collisions) {
      candidate.resolution = "ambiguous";
      addIssue(candidate.issues, { code: "ambiguous_identity", severity: "block", message: "Multiple import candidates resolve to the same attorney." });
    }
  }
  return candidates;
}
