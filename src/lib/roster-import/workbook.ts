import * as XLSX from "xlsx";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_ROWS,
  readCellText,
} from "@/lib/spreadsheet-safe";
import type { ColumnMapping, PercentFormat, StoredCell, StoredRow } from "./types";

const CELL_TEXT_LIMIT = 2048;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIMES = new Set(["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"]);

export type WorkbookInspection = {
  sheetName: string;
  headers: string[];
  rows: Array<{ rowNumber: number; raw: StoredRow }>;
  suggestedMapping: ColumnMapping;
  suggestedPercentFormat: PercentFormat;
  percentExample: { rowNumber: number; raw: string; stored: number } | null;
};

export function validateWorkbookUpload(file: {
  name: string;
  type: string;
  size: number;
}): void {
  const extension = file.name.toLocaleLowerCase("en-US").match(/\.[^.]+$/)?.[0];
  if (extension !== ".xlsx" && extension !== ".csv") {
    throw new Error("Only .xlsx and .csv roster files are accepted.");
  }
  const mime = file.type.toLocaleLowerCase("en-US").split(";", 1)[0];
  const allowedMime =
    extension === ".xlsx"
      ? mime === XLSX_MIME || mime === "application/octet-stream"
      : CSV_MIMES.has(mime) || mime === "application/octet-stream";
  if (!allowedMime) throw new Error("The upload content type does not match an accepted workbook.");
  if (file.size <= 0) throw new Error("The uploaded workbook is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Workbook exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB upload limit.`);
  }
}

function storedCell(cell: XLSX.CellObject | undefined): StoredCell {
  if (!cell) return { text: "" };
  if (typeof cell.f === "string" && cell.f.length > 0) {
    return {
      text: "",
      ...(cell.z !== undefined ? { numberFormat: readCellText(String(cell.z), { maxLength: 128 }) } : {}),
      rejectedFormula: true,
    };
  }
  const fullText = readCellText(cell, { maxLength: CELL_TEXT_LIMIT + 1 });
  const result: StoredCell = {
    text: fullText.slice(0, CELL_TEXT_LIMIT),
    ...(typeof cell.z === "string" ? { numberFormat: readCellText(cell.z, { maxLength: 128 }) } : {}),
  };
  if (fullText.length > CELL_TEXT_LIMIT) result.truncated = true;
  if (typeof cell.v === "number" && Number.isFinite(cell.v)) result.numericValue = cell.v;
  return result;
}

const aliases: Record<keyof ColumnMapping, string[]> = {
  firstName: ["first name", "firstname", "first"],
  lastName: ["last name", "lastname", "last"],
  email: ["email", "e-mail", "email address"],
  firm: ["firm", "law firm", "company"],
  city: ["city"],
  organizationType: ["organization type", "organization"],
  practiceArea: ["practice area", "practice"],
  percent: ["percent of practice", "percentage", "percent", "% of practice"],
  partnerCount: ["# partners", "partners", "partner count"],
  associateCount: ["# associates", "associates", "associate count"],
  ofCounselCount: ["# of counsel", "of counsel", "of counsel count"],
  resumeReference: ["resume", "resume url", "resume reference", "resume link"],
};

function suggestMapping(headers: string[]): ColumnMapping {
  const normalized = new Map(headers.map((header) => [header.toLocaleLowerCase("en-US"), header]));
  const mapping: ColumnMapping = {};
  for (const [field, candidates] of Object.entries(aliases)) {
    const header = candidates.map((candidate) => normalized.get(candidate)).find(Boolean);
    if (header) mapping[field as keyof ColumnMapping] = header;
  }
  return mapping;
}

function percentageSuggestion(
  rows: Array<{ rowNumber: number; raw: StoredRow }>,
  header: string | undefined
): { format: PercentFormat; example: WorkbookInspection["percentExample"] } {
  if (!header) return { format: "whole", example: null };
  const cells = rows.map((row) => ({ rowNumber: row.rowNumber, cell: row.raw[header] })).filter((item) => item.cell);
  const numeric = cells.filter((item) => item.cell.numericValue !== undefined);
  const fraction = numeric.some((item) => item.cell.numberFormat?.includes("%")) ||
    (numeric.length > 0 && numeric.every((item) => (item.cell.numericValue ?? 0) >= 0 && (item.cell.numericValue ?? 0) <= 1));
  const sample = cells.find((item) => item.cell.text || item.cell.numericValue !== undefined);
  if (!sample) return { format: fraction ? "fraction" : "whole", example: null };
  const raw = sample.cell.numericValue ?? Number.parseFloat(sample.cell.text.replace(/%$/, ""));
  const textPercent = sample.cell.numericValue === undefined && sample.cell.text.endsWith("%");
  const stored = textPercent ? raw : fraction ? raw * 100 : raw;
  return {
    format: fraction ? "fraction" : "whole",
    example: Number.isFinite(stored)
      ? { rowNumber: sample.rowNumber, raw: sample.cell.numericValue === undefined ? sample.cell.text : String(sample.cell.numericValue), stored }
      : null,
  };
}

export function inspectWorkbook(
  buffer: Buffer,
  file: { name: string; type: string; size: number },
  options?: { allSheets?: boolean }
): WorkbookInspection {
  validateWorkbookUpload(file);
  if (buffer.byteLength !== file.size || buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Workbook size changed during upload or exceeds the upload limit.");
  }
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellNF: true, cellFormula: true, cellText: true, raw: true });
  } catch {
    throw new Error("The workbook could not be parsed as a valid .xlsx or .csv file.");
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no worksheets.");
  const sheet = workbook.Sheets[sheetName];
  const range = sheet?.["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  if (!sheet || !range) throw new Error("The first worksheet is empty.");
  const selectedSheets = options?.allSheets ? workbook.SheetNames : [sheetName];
  let declaredRows = 0;
  for (const selectedName of selectedSheets) {
    const selected = workbook.Sheets[selectedName];
    const selectedRange = selected?.["!ref"] ? XLSX.utils.decode_range(selected["!ref"]) : null;
    if (!selectedRange) continue;
    const worksheetRows = selectedRange.e.r - selectedRange.s.r;
    if (worksheetRows > MAX_UPLOAD_ROWS) {
      throw new Error(`Workbook exceeds the ${MAX_UPLOAD_ROWS}-row limit.`);
    }
    declaredRows += worksheetRows;
    if (declaredRows > MAX_UPLOAD_ROWS) {
      throw new Error(`Workbook exceeds the ${MAX_UPLOAD_ROWS}-row limit.`);
    }
  }

  const headers: string[] = [];
  const headerColumns: number[] = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const text = readCellText(sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })], { maxLength: 256 });
    if (text && !headers.includes(text)) {
      headers.push(text);
      headerColumns.push(column);
    }
  }
  if (headers.length === 0) throw new Error("The first worksheet has no usable header row.");
  const rows: Array<{ rowNumber: number; raw: StoredRow }> = [];
  let sequentialRow = 2;
  for (const selectedName of selectedSheets) {
    const selected = workbook.Sheets[selectedName];
    const selectedRange = selected?.["!ref"] ? XLSX.utils.decode_range(selected["!ref"]) : null;
    if (!selected || !selectedRange) continue;
    for (let row = selectedRange.s.r + 1; row <= selectedRange.e.r; row += 1) {
      const raw: StoredRow = {};
      let populated = false;
      headers.forEach((header, index) => {
        const selectedHeader = readCellText(selected[XLSX.utils.encode_cell({ r: selectedRange.s.r, c: headerColumns[index] })], { maxLength: 256 });
        const value = selectedHeader === header
          ? storedCell(selected[XLSX.utils.encode_cell({ r: row, c: headerColumns[index] })])
          : { text: "" };
        raw[header] = value;
        populated ||= Boolean(value.text || value.numericValue !== undefined || value.rejectedFormula);
      });
      if (populated) rows.push({ rowNumber: options?.allSheets ? sequentialRow++ : row + 1, raw });
    }
  }
  if (rows.length > MAX_UPLOAD_ROWS) throw new Error(`Workbook exceeds the ${MAX_UPLOAD_ROWS}-row limit.`);
  const suggestedMapping = suggestMapping(headers);
  const percentage = percentageSuggestion(rows, suggestedMapping.percent);
  return { sheetName: options?.allSheets ? selectedSheets.join(", ") : sheetName, headers, rows, suggestedMapping, suggestedPercentFormat: percentage.format, percentExample: percentage.example };
}
