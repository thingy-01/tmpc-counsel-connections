import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { firstValidEmail, identityKey } from "./normalize";
import type { ColumnMapping, StoredRow } from "./types";
import { validateRosterCandidates } from "./validator";
import { inspectWorkbook } from "./workbook";

const rosterPath = path.resolve("data/03-availability-selection/03C_Breakdown of Law Firm Attorneys - Counsel Connections 2025 (9.30.25).xlsx");
const assignmentsPath = path.resolve("data/04-assignments/04_Assignments - Counsel Connections 2025.xlsx");
const rosterMapping: ColumnMapping = {
  firstName: "First Name",
  lastName: "Last Name",
  firm: "Firm",
  city: "City",
  organizationType: "Organization Type",
  practiceArea: "Practice Area",
  percent: "Percent of Practice",
  partnerCount: "# Partners",
  associateCount: "# Associates",
  ofCounselCount: "# Of Counsel",
};

async function tracked() {
  const [rosterBytes, assignmentBytes] = await Promise.all([readFile(rosterPath), readFile(assignmentsPath)]);
  const roster = inspectWorkbook(rosterBytes, { name: path.basename(rosterPath), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: rosterBytes.byteLength });
  const companion = inspectWorkbook(assignmentBytes, { name: path.basename(assignmentsPath), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: assignmentBytes.byteLength }, { allSheets: true });
  const mapping = companion.suggestedMapping;
  const joined: Record<string, string> = {};
  for (const row of companion.rows) {
    if (!mapping.firstName || !mapping.lastName || !mapping.firm || !mapping.email) continue;
    const first = row.raw[mapping.firstName]?.text ?? "";
    const last = row.raw[mapping.lastName]?.text ?? "";
    const firm = row.raw[mapping.firm]?.text ?? "";
    const email = row.raw[mapping.email]?.text ?? "";
    const resolved = firstValidEmail(email);
    if (first && last && firm && resolved) joined[identityKey(first, last, firm)] = resolved;
  }
  return { roster, joined };
}

test("tracked fraction percentages store whole-scale values and preserve the anomalous three rows", async () => {
  const { roster, joined } = await tracked();
  const candidates = validateRosterCandidates({ rows: roster.rows, mapping: rosterMapping, percentFormat: "fraction", existingAttorneys: [], joinedEmails: joined });
  assert.equal(candidates.length, 130);
  assert.equal(candidates.filter((candidate) => candidate.resolution === "needs_email").length, 10);
  assert.ok(!JSON.stringify(candidates).includes("placeholder.com"));
  const ordinary = candidates.find((candidate) => candidate.parsed.practiceAreas.length === 2 && candidate.parsed.practiceAreas.every((entry) => entry.percent === 50));
  assert.ok(ordinary);
  assert.ok(ordinary.parsed.practiceAreas.every((entry) => entry.percentScale === "whole"));
  const oneHundred = candidates.find((candidate) => candidate.parsed.practiceAreas.some((entry) => entry.percent === 100));
  assert.ok(oneHundred);
  const anomalous = candidates.find((candidate) => candidate.parsed.firstName === "Adam" && candidate.parsed.lastName === "Sloustcher");
  assert.ok(anomalous);
  assert.equal(anomalous.parsed.practiceAreas.length, 3);
  assert.deepEqual(new Set(anomalous.issues.map((issue) => issue.code)), new Set(["over_two_areas", "duplicate_area", "percent_sum_out_of_range", "missing_resume_reference"]));
});

test("whole numeric 50/50 and percentage text normalize identically without double multiplication", () => {
  const base = { "First": { text: "Morgan" }, "Last": { text: "Sample" }, "Firm": { text: "Synthetic LLP" }, "Area": { text: "Taxation" } } satisfies StoredRow;
  const rows = [
    { rowNumber: 2, raw: { ...base, Percent: { text: "50", numericValue: 50 } } },
    { rowNumber: 3, raw: { ...base, Area: { text: "Corporate" }, Percent: { text: "50%" } } },
  ];
  const candidate = validateRosterCandidates({ rows, mapping: { firstName: "First", lastName: "Last", firm: "Firm", practiceArea: "Area", percent: "Percent" }, percentFormat: "whole", existingAttorneys: [], joinedEmails: { [identityKey("Morgan", "Sample", "Synthetic LLP")]: "morgan@example.test" } })[0];
  assert.deepEqual(candidate.parsed.practiceAreas.map(({ percent, percentScale }) => ({ percent, percentScale })), [{ percent: 50, percentScale: "whole" }, { percent: 50, percentScale: "whole" }]);
});

test("correction supplies one missing email and duplicated identity across firms remains candidate-local ambiguous", async () => {
  const { roster, joined } = await tracked();
  const initial = validateRosterCandidates({ rows: roster.rows, mapping: rosterMapping, percentFormat: "fraction", existingAttorneys: [], joinedEmails: joined });
  const missing = initial.find((candidate) => candidate.resolution === "needs_email");
  assert.ok(missing);
  const corrected = validateRosterCandidates({ rows: roster.rows, mapping: rosterMapping, percentFormat: "fraction", existingAttorneys: [], joinedEmails: joined, overrides: { [missing.identityKey]: { correctedEmail: "synthetic.correction@example.test" } } });
  assert.equal(corrected.find((candidate) => candidate.identityKey === missing.identityKey)?.resolution, "create");

  const syntheticRows = [
    { rowNumber: 2, raw: { First: { text: "Avery" }, Last: { text: "Duplicate" }, Firm: { text: "North LLP" }, Email: { text: "avery.north@example.test" }, Area: { text: "Taxation" }, Percent: { text: "100", numericValue: 100 } } },
    { rowNumber: 3, raw: { First: { text: "Avery" }, Last: { text: "Duplicate" }, Firm: { text: "South LLP" }, Email: { text: "avery.south@example.test" }, Area: { text: "Corporate" }, Percent: { text: "100", numericValue: 100 } } },
    { rowNumber: 4, raw: { First: { text: "Riley" }, Last: { text: "Clear" }, Firm: { text: "Clear LLP" }, Email: { text: "riley@example.test" }, Area: { text: "Finance" }, Percent: { text: "100", numericValue: 100 } } },
  ];
  const candidates = validateRosterCandidates({ rows: syntheticRows, mapping: { firstName: "First", lastName: "Last", firm: "Firm", email: "Email", practiceArea: "Area", percent: "Percent" }, percentFormat: "whole", existingAttorneys: [] });
  assert.equal(candidates.filter((candidate) => candidate.resolution === "ambiguous").length, 2);
  assert.equal(candidates.find((candidate) => candidate.parsed.firstName === "Riley")?.resolution, "create");
});

test("hostile formulas and resume URLs are inert and import never fetches", () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; throw new Error("fetch forbidden"); }) as typeof fetch;
  try {
    const urls = ["javascript:alert(1)", "https://user:pass@example.com/resume", "https://169.254.169.254/resume"];
    const rows = urls.map((url, index) => ({ rowNumber: index + 2, raw: {
      First: { text: "Formula", rejectedFormula: index === 0 }, Last: { text: "Candidate" }, Firm: { text: "Synthetic LLP" }, Email: { text: "formula@example.test" }, Area: { text: `Area ${index}`, truncated: index === 2 }, Percent: { text: "", rejectedFormula: index === 0 }, Resume: { text: url },
    } }));
    const candidate = validateRosterCandidates({ rows, mapping: { firstName: "First", lastName: "Last", firm: "Firm", email: "Email", practiceArea: "Area", percent: "Percent", resumeReference: "Resume" }, percentFormat: "whole", existingAttorneys: [] })[0];
    assert.equal(candidate.parsed.resumeReferences.length, 0);
    assert.ok(candidate.issues.some((issue) => issue.code === "formula_cell"));
    assert.ok(candidate.issues.some((issue) => issue.code === "unsafe_resume_reference"));
    assert.ok(candidate.issues.some((issue) => issue.code === "oversized_cell"));
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
