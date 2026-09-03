import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as XLSX from "xlsx";
import { MAX_UPLOAD_BYTES } from "@/lib/spreadsheet-safe";
import { inspectWorkbook, validateWorkbookUpload } from "./workbook";

const rosterPath = path.resolve(
  "data/03-availability-selection/03C_Breakdown of Law Firm Attorneys - Counsel Connections 2025 (9.30.25).xlsx"
);

test("tracked workbook keeps numeric percent values and number formats beside display text", async () => {
  const bytes = await readFile(rosterPath);
  const workbook = inspectWorkbook(bytes, {
    name: path.basename(rosterPath),
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: bytes.byteLength,
  });
  assert.equal(workbook.rows.length, 217);
  assert.equal(workbook.suggestedPercentFormat, "fraction");
  const percentages = workbook.rows.map((row) => row.raw["Percent of Practice"]);
  assert.ok(percentages.some((cell) => cell.numericValue === 0.5 && cell.text === "50%" && cell.numberFormat === "0%"));
  assert.ok(percentages.some((cell) => cell.numericValue === 1 && cell.text === "100%" && cell.numberFormat === "0%"));
  assert.equal(workbook.percentExample?.stored, (workbook.rows[0].raw["Percent of Practice"].numericValue ?? 0) * 100);
});

test("upload guard accepts an actually parsed file over 1 MB and rejects above 5 MB", () => {
  const header = "First Name,Last Name,Firm,Practice Area,Percent of Practice\n";
  const row = `Taylor,Example,Firm ${"x".repeat(540)},Taxation,50\n`;
  const buffer = Buffer.from(header + row.repeat(2100));
  assert.ok(buffer.byteLength > 1024 * 1024 && buffer.byteLength < MAX_UPLOAD_BYTES);
  const inspected = inspectWorkbook(buffer, { name: "synthetic.csv", type: "text/csv", size: buffer.byteLength });
  assert.equal(inspected.rows.length, 2100);
  assert.throws(
    () => validateWorkbookUpload({ name: "too-large.csv", type: "text/csv", size: MAX_UPLOAD_BYTES + 1 }),
    /5 MB/
  );
  assert.throws(() => validateWorkbookUpload({ name: "roster.xls", type: "application/vnd.ms-excel", size: 10 }), /Only .xlsx and .csv/);
});

test("companion row caps are enforced cumulatively before multi-sheet materialization", () => {
  const workbook = XLSX.utils.book_new();
  for (const name of ["First", "Second"]) {
    const rows = [["First Name", "Last Name", "Firm", "eMail"]];
    for (let index = 0; index < 2600; index += 1) {
      rows.push(["Synthetic", `${name}-${index}`, "Fixture LLP", `person-${name}-${index}@example.test`]);
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  assert.throws(
    () => inspectWorkbook(bytes, { name: "multi-sheet.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: bytes.length }, { allSheets: true }),
    /5000-row limit/
  );
});
