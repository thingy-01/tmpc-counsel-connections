import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  TRACKED_ASSIGNMENTS_HEADERS,
  buildMailMergeTable,
  type MailMergeAttorney,
} from "./mail-merge";

function fixture(interviewCount: number): MailMergeAttorney {
  return {
    id: "attorney-1",
    firstName: "Avery",
    lastName: "Stone",
    phone: "555-0100",
    email: "avery@example.test",
    firm: "Stone Law",
    conflicts: "",
    interviews: Array.from({ length: interviewCount }, (_, index) => ({
      dayDate: "2026-10-06",
      startTime: "16:15:00",
      endTime: "16:30:00",
      companyName:
        index === 0 ? '=HYPERLINK("http://evil.test","x")' : `Company ${index + 1}`,
      interviewerName: index === 0 ? "+1+1" : `Interviewer ${index + 1}`,
      preferredPlatform: "zoom",
      notes: null,
    })),
  };
}

test("mail-merge header preserves the tracked workbook and Word merge fields", () => {
  const table = buildMailMergeTable([fixture(9)]);
  assert.deepEqual(table.headers.slice(0, TRACKED_ASSIGNMENTS_HEADERS.length), [
    ...TRACKED_ASSIGNMENTS_HEADERS,
  ]);
  assert.equal(table.headers[3], "eMail");
  assert.equal(table.headers[10], "Comments1 ");
  assert.equal(table.headers.at(-1), "Overflow_Count");

  const wordFields = [
    "First_Name",
    "Last_Name",
    ...Array.from({ length: 8 }, (_, index) => {
      const n = index + 1;
      return [`Company${n}`, `Date${n}`, `Time${n}`, `Interviewer${n}`, n === 1 ? "Comments1_" : `Comments${n}`];
    }).flat(),
  ];
  const normalizedHeaders = new Set(
    table.headers.map((header) => header.replace(/ /g, "_"))
  );
  for (const field of wordFields) assert.ok(normalizedHeaders.has(field), field);
});

test("tracked workbook fixture confirms the original byte-for-byte header values", async () => {
  const bytes = await readFile(
    "data/04-assignments/04_Assignments - Counsel Connections 2025.xlsx"
  );
  const workbook = XLSX.read(bytes);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const [header] = XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  assert.deepEqual(header, [...TRACKED_ASSIGNMENTS_HEADERS]);
});

test("nine interviews export without truncation and surface overflow", () => {
  const table = buildMailMergeTable([fixture(9)]);
  assert.equal(table.groupCount, 9);
  assert.equal(table.rows[0].length, table.headers.length);
  assert.equal(table.rows[0].at(-1), "1");
  assert.deepEqual(table.overflowAttorneys, [
    { id: "attorney-1", name: "Avery Stone", count: 9 },
  ]);
  assert.ok(table.rows[0].includes("Company 9"));
});

test("interviewer labels match singular and plural tracked formats", () => {
  const attorney = fixture(2);
  attorney.interviews[1].interviewerName = "A Person & B Person";
  const table = buildMailMergeTable([attorney]);
  assert.equal(table.rows[0][9], "'Interviewer: +1+1");
  assert.equal(table.rows[0][14], "Interviewers: A Person & B Person");
});

test("formula-like company and interviewer values reopen as literal text", () => {
  const table = buildMailMergeTable([fixture(1)]);
  assert.equal(table.rows[0][8], `'${'=HYPERLINK("http://evil.test","x")'}`);
  assert.equal(table.rows[0][9], "'Interviewer: +1+1");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]),
    "Assignments"
  );
  const reopened = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  const rows = XLSX.utils.sheet_to_json<string[]>(
    reopened.Sheets[reopened.SheetNames[0]],
    { header: 1, raw: true, defval: "" }
  );
  assert.equal(rows[1][8], `'${'=HYPERLINK("http://evil.test","x")'}`);
  assert.equal(rows[1][9], "'Interviewer: +1+1");
});
