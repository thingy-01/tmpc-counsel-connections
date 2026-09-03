import { isIP } from "node:net";

/** Maximum accepted workbook upload size in bytes. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Maximum accepted source rows per workbook upload. */
export const MAX_UPLOAD_ROWS = 5000;

type SpreadsheetCell = {
  v?: unknown;
  w?: unknown;
};

/** Converts a cell's displayed or typed value without reading formula/link metadata. */
export function readCellText(
  cell: unknown,
  opts?: { maxLength?: number }
): string {
  let value = cell;

  if (cell !== null && typeof cell === "object" && !(cell instanceof Date)) {
    const spreadsheetCell = cell as SpreadsheetCell;
    value =
      typeof spreadsheetCell.w === "string"
        ? spreadsheetCell.w
        : spreadsheetCell.v;
  }

  let text: string;
  if (value === null || value === undefined) {
    text = "";
  } else if (value instanceof Date) {
    text = value.toISOString();
  } else if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    text = String(value);
  } else {
    text = "";
  }

  const normalized = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  const requestedMax = opts?.maxLength ?? 512;
  const maxLength = Number.isFinite(requestedMax)
    ? Math.max(0, Math.floor(requestedMax))
    : 512;

  return normalized.slice(0, maxLength);
}

/** Prevents a spreadsheet application from evaluating an exported value. */
export function escapeForSpreadsheet(value: string): string {
  return /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
}

/** Accepts public-looking HTTPS DNS URLs without resolving or fetching them. */
export function isSafeExternalUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.username || url.password) return false;

  const hostname = url.hostname.toLowerCase();
  if (!hostname || isIP(hostname) !== 0) return false;
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".lan")
  ) {
    return false;
  }

  const labels = hostname.split(".");
  if (labels.length < 2) return false;
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  );
}
