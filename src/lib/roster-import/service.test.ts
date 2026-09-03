import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignments,
  attorneyResumeReferences,
  attorneys,
  attorneyUnavailability,
  companies,
  eventDays,
  events,
  rosterImportCandidates,
  timeSlots,
} from "@/lib/db/schema";
import { applyRosterImport, correctRosterPreview, stageRosterPreview } from "./service";
import type { ColumnMapping, StoredRow } from "./types";
import { inspectWorkbook, type WorkbookInspection } from "./workbook";
import { requireLocalTestDatabase } from "../../../scripts/test-database-guard";

const databaseEnabled = Boolean(process.env.DATABASE_URL);
const mapping: ColumnMapping = {
  firstName: "First",
  lastName: "Last",
  email: "Email",
  firm: "Firm",
  city: "City",
  practiceArea: "Area",
  percent: "Percent",
  resumeReference: "Resume",
};

function inspection(rows: StoredRow[]): WorkbookInspection {
  return {
    sheetName: "Synthetic",
    headers: ["First", "Last", "Email", "Firm", "City", "Area", "Percent", "Resume"],
    rows: rows.map((raw, index) => ({ rowNumber: index + 2, raw })),
    suggestedMapping: mapping,
    suggestedPercentFormat: "whole",
    percentExample: { rowNumber: 2, raw: "100", stored: 100 },
  };
}

function row(values: { first: string; last: string; email?: string; firm: string; city?: string; area?: string; percent?: number; resume?: string }): StoredRow {
  return {
    First: { text: values.first },
    Last: { text: values.last },
    Email: { text: values.email ?? "" },
    Firm: { text: values.firm },
    City: { text: values.city ?? "" },
    Area: { text: values.area ?? "Taxation" },
    Percent: values.percent === undefined ? { text: "" } : { text: String(values.percent), numericValue: values.percent },
    Resume: { text: values.resume ?? "" },
  };
}

test("database apply is idempotent and preserves schedule, status, unavailability, and uploaded resume fields", { skip: !databaseEnabled }, async (t) => {
  requireLocalTestDatabase();
  const createdEvent = await db.insert(events).values({ name: "Synthetic import preservation", startDate: "2031-01-01", endDate: "2031-01-02", status: "draft" }).returning({ id: events.id });
  const eventId = createdEvent[0].id;
  t.after(async () => { await db.delete(events).where(eq(events.id, eventId)); });
  const existing = await db.insert(attorneys).values({
    eventId,
    firstName: "Jordan",
    lastName: "Preserve",
    email: "jordan.preserve@example.test",
    firm: "Synthetic LLP",
    city: "Old City",
    status: "withdrawn",
    resumePath: "synthetic/existing.pdf",
    resumeOriginalName: "existing.pdf",
    resumeSize: 4321,
    resumeUploadedAt: new Date("2030-01-01T00:00:00Z"),
    practiceAreas: [{ area: "Taxation", percent: 1 }],
  }).returning({ id: attorneys.id });
  const company = await db.insert(companies).values({ eventId, name: "Synthetic Company" }).returning({ id: companies.id });
  const day = await db.insert(eventDays).values({ eventId, date: "2031-01-01", label: "Day", startTime: "09:00", endTime: "10:00" }).returning({ id: eventDays.id });
  const slot = await db.insert(timeSlots).values({ eventDayId: day[0].id, startTime: "09:00", endTime: "09:15", sortOrder: 1 }).returning({ id: timeSlots.id });
  const assignment = await db.insert(assignments).values({ companyId: company[0].id, attorneyId: existing[0].id, timeSlotId: slot[0].id, notes: "preserve assignment" }).returning({ id: assignments.id });
  const block = await db.insert(attorneyUnavailability).values({ attorneyId: existing[0].id, timeSlotId: slot[0].id, note: "distinctive private note" }).returning({ id: attorneyUnavailability.id });

  const preview = await stageRosterPreview({
    eventId,
    uploadedBy: "test-admin",
    filename: "synthetic.csv",
    fileBytes: Buffer.from("synthetic"),
    inspection: inspection([row({ first: "Jordan", last: "Preserve", email: "JORDAN.PRESERVE@EXAMPLE.TEST ", firm: "Synthetic LLP", city: "New City", percent: 100, resume: "https://resumes.example.test/jordan" })]),
    mapping,
    percentFormat: "whole",
    companion: null,
    companionMapping: null,
  });
  assert.equal(preview.candidates[0].resolution, "update");
  const before = await db.select().from(attorneys).where(eq(attorneys.id, existing[0].id));
  const first = await applyRosterImport({ eventId, importId: preview.importId, decisions: [{ candidateId: preview.candidates[0].candidateId, decision: "update" }] });
  const recorded = await db.select({ error: rosterImportCandidates.appliedError }).from(rosterImportCandidates).where(eq(rosterImportCandidates.id, preview.candidates[0].candidateId));
  assert.equal(first.updated, 1, JSON.stringify({ first, error: recorded[0]?.error }));
  const after = await db.select().from(attorneys).where(eq(attorneys.id, existing[0].id));
  assert.equal(after[0].city, "New City");
  assert.equal(after[0].status, "withdrawn");
  assert.deepEqual(after[0].practiceAreas, [{ area: "Taxation", percent: 1 }]);
  assert.deepEqual(
    [after[0].resumePath, after[0].resumeOriginalName, after[0].resumeSize, after[0].resumeUploadedAt?.toISOString()],
    [before[0].resumePath, before[0].resumeOriginalName, before[0].resumeSize, before[0].resumeUploadedAt?.toISOString()]
  );
  assert.equal((await db.select().from(assignments).where(eq(assignments.id, assignment[0].id))).length, 1);
  assert.equal((await db.select().from(attorneyUnavailability).where(eq(attorneyUnavailability.id, block[0].id)))[0].note, "distinctive private note");
  assert.equal((await db.select().from(attorneyResumeReferences).where(eq(attorneyResumeReferences.attorneyId, existing[0].id))).length, 1);

  const second = await applyRosterImport({ eventId, importId: preview.importId, decisions: [{ candidateId: preview.candidates[0].candidateId, decision: "update" }] });
  assert.deepEqual(second, { created: 0, updated: 0, unchanged: 1, skipped: 0, raced: 0, failed: 0 });
});

test("missing email correction, forged candidate, and stale preview are refused before unsafe writes", { skip: !databaseEnabled }, async (t) => {
  const eventRows = await db.insert(events).values([
    { name: "Synthetic correction event", startDate: "2032-01-01", endDate: "2032-01-01" },
    { name: "Synthetic foreign event", startDate: "2032-02-01", endDate: "2032-02-01" },
  ]).returning({ id: events.id });
  t.after(async () => { for (const event of eventRows) await db.delete(events).where(eq(events.id, event.id)); });
  const [eventId, foreignEventId] = eventRows.map((event) => event.id);
  const noEmail = await stageRosterPreview({ eventId, uploadedBy: "test-admin", filename: "missing.csv", fileBytes: Buffer.from("missing"), inspection: inspection([row({ first: "Casey", last: "Correction", firm: "Correction LLP", city: "Austin", percent: 100 })]), mapping, percentFormat: "whole", companion: null, companionMapping: null });
  assert.equal(noEmail.candidates[0].resolution, "needs_email");
  await assert.rejects(() => applyRosterImport({ eventId, importId: noEmail.importId, decisions: [{ candidateId: noEmail.candidates[0].candidateId, decision: "create" }] }), /Blocked candidates/);
  assert.equal((await db.select().from(attorneys).where(eq(attorneys.eventId, eventId))).length, 0);
  await assert.rejects(() => correctRosterPreview({ eventId, importId: noEmail.importId, candidateId: noEmail.candidates[0].candidateId, correctedEmail: "not-an-email" }), /invalid/);
  const corrected = await correctRosterPreview({ eventId, importId: noEmail.importId, candidateId: noEmail.candidates[0].candidateId, correctedEmail: "casey.correction@example.test" });
  assert.equal(corrected.candidates[0].resolution, "create");

  const foreign = await stageRosterPreview({ eventId: foreignEventId, uploadedBy: "test-admin", filename: "foreign.csv", fileBytes: Buffer.from("foreign"), inspection: inspection([row({ first: "Foreign", last: "Candidate", email: "foreign@example.test", firm: "Foreign LLP", percent: 100 })]), mapping, percentFormat: "whole", companion: null, companionMapping: null });
  await assert.rejects(() => applyRosterImport({ eventId, importId: noEmail.importId, decisions: [{ candidateId: foreign.candidates[0].candidateId, decision: "create" }] }), /exactly this import/);
  assert.equal((await db.select().from(attorneys).where(eq(attorneys.eventId, eventId))).length, 0);

  const existing = await db.insert(attorneys).values({ eventId, firstName: "Stale", lastName: "Target", email: "stale@example.test", firm: "Stable LLP", city: "Old" }).returning({ id: attorneys.id });
  const stale = await stageRosterPreview({ eventId, uploadedBy: "test-admin", filename: "stale.csv", fileBytes: Buffer.from("stale"), inspection: inspection([row({ first: "Stale", last: "Target", email: "stale@example.test", firm: "Stable LLP", city: "Imported", percent: 100 })]), mapping, percentFormat: "whole", companion: null, companionMapping: null });
  await db.update(attorneys).set({ city: "Changed after preview" }).where(eq(attorneys.id, existing[0].id));
  const staleResult = await applyRosterImport({ eventId, importId: stale.importId, decisions: [{ candidateId: stale.candidates[0].candidateId, decision: "update" }] });
  assert.equal(staleResult.failed, 1);
  assert.equal((await db.select({ city: attorneys.city }).from(attorneys).where(eq(attorneys.id, existing[0].id)))[0].city, "Changed after preview");
  assert.match((await db.select({ error: rosterImportCandidates.appliedError }).from(rosterImportCandidates).where(and(eq(rosterImportCandidates.importId, stale.importId), eq(rosterImportCandidates.id, stale.candidates[0].candidateId))))[0].error ?? "", /Stale preview/);
});

test("tracked anomalous attorney applies with all three practice rows intact", { skip: !databaseEnabled }, async (t) => {
  const createdEvent = await db.insert(events).values({ name: "Synthetic tracked slice event", startDate: "2033-01-01", endDate: "2033-01-01" }).returning({ id: events.id });
  const eventId = createdEvent[0].id;
  t.after(async () => { await db.delete(events).where(eq(events.id, eventId)); });
  const rosterPath = path.resolve("data/03-availability-selection/03C_Breakdown of Law Firm Attorneys - Counsel Connections 2025 (9.30.25).xlsx");
  const assignmentPath = path.resolve("data/04-assignments/04_Assignments - Counsel Connections 2025.xlsx");
  const [rosterBytes, assignmentBytes] = await Promise.all([readFile(rosterPath), readFile(assignmentPath)]);
  const roster = inspectWorkbook(rosterBytes, { name: path.basename(rosterPath), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: rosterBytes.length });
  const companion = inspectWorkbook(assignmentBytes, { name: path.basename(assignmentPath), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: assignmentBytes.length }, { allSheets: true });
  const selectedRows = roster.rows.filter((source) => source.raw["First Name"].text === "Adam" && source.raw["Last Name"].text === "Sloustcher");
  const preview = await stageRosterPreview({ eventId, uploadedBy: "test-admin", filename: path.basename(rosterPath), fileBytes: rosterBytes, inspection: { ...roster, rows: selectedRows }, mapping: roster.suggestedMapping, percentFormat: "fraction", companion, companionMapping: companion.suggestedMapping });
  assert.deepEqual(new Set(preview.candidates[0].issues.map((issue) => issue.code).filter((code) => code !== "missing_resume_reference")), new Set(["over_two_areas", "duplicate_area", "percent_sum_out_of_range"]));
  const result = await applyRosterImport({ eventId, importId: preview.importId, decisions: [{ candidateId: preview.candidates[0].candidateId, decision: "create" }] });
  assert.equal(result.created, 1);
  const stored = await db.select({ practiceAreas: attorneys.practiceAreas }).from(attorneys).where(eq(attorneys.eventId, eventId));
  assert.equal((stored[0].practiceAreas as unknown[]).length, 3);
});

test("full tracked roster leaves exactly ten email gaps, then correction creates exactly one", { skip: !databaseEnabled }, async (t) => {
  const createdEvent = await db.insert(events).values({ name: "Synthetic full roster event", startDate: "2034-01-01", endDate: "2034-01-01" }).returning({ id: events.id });
  const eventId = createdEvent[0].id;
  t.after(async () => { await db.delete(events).where(eq(events.id, eventId)); });
  const rosterPath = path.resolve("data/03-availability-selection/03C_Breakdown of Law Firm Attorneys - Counsel Connections 2025 (9.30.25).xlsx");
  const assignmentPath = path.resolve("data/04-assignments/04_Assignments - Counsel Connections 2025.xlsx");
  const [rosterBytes, assignmentBytes] = await Promise.all([readFile(rosterPath), readFile(assignmentPath)]);
  const roster = inspectWorkbook(rosterBytes, { name: path.basename(rosterPath), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: rosterBytes.length });
  const companion = inspectWorkbook(assignmentBytes, { name: path.basename(assignmentPath), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: assignmentBytes.length }, { allSheets: true });
  const preview = await stageRosterPreview({ eventId, uploadedBy: "test-admin", filename: path.basename(rosterPath), fileBytes: rosterBytes, inspection: roster, mapping: roster.suggestedMapping, percentFormat: "fraction", companion, companionMapping: companion.suggestedMapping });
  const gaps = preview.candidates.filter((candidate) => candidate.resolution === "needs_email");
  assert.equal(gaps.length, 10);
  const firstApply = await applyRosterImport({
    eventId,
    importId: preview.importId,
    decisions: preview.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      decision: candidate.resolution === "create" ? ("create" as const) : ("skip" as const),
    })),
  });
  assert.equal(firstApply.created, 120);
  assert.equal(firstApply.skipped, 10);
  const initiallyStored = await db.select({ email: attorneys.email }).from(attorneys).where(eq(attorneys.eventId, eventId));
  assert.equal(initiallyStored.length, 120);
  assert.ok(initiallyStored.every((attorney) => !attorney.email.includes("placeholder.com")));

  const corrected = await correctRosterPreview({
    eventId,
    importId: preview.importId,
    candidateId: gaps[0].candidateId,
    correctedEmail: "tracked-gap-correction@example.test",
  });
  const correctedCandidate = corrected.candidates.find((candidate) => candidate.candidateId === gaps[0].candidateId);
  assert.equal(correctedCandidate?.resolution, "create");
  const secondApply = await applyRosterImport({
    eventId,
    importId: preview.importId,
    decisions: corrected.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      decision: candidate.candidateId === gaps[0].candidateId ? ("create" as const) : ("skip" as const),
    })),
  });
  assert.equal(secondApply.created, 1);
  assert.equal((await db.select().from(attorneys).where(eq(attorneys.eventId, eventId))).length, 121);
});
