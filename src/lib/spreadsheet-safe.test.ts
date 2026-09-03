import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeForSpreadsheet,
  isSafeExternalUrl,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_ROWS,
  readCellText,
} from "./spreadsheet-safe";

test("readCellText prefers formatted values and ignores formula and link targets", () => {
  assert.equal(
    readCellText({
      v: 0.5,
      w: "50%",
      f: "HYPERLINK(\"https://example.com\")",
      l: { Target: "https://example.com" },
    }),
    "50%"
  );
  assert.equal(readCellText({ f: "1+1" }), "");
  assert.equal(
    readCellText({ v: "visible label", l: { Target: "javascript:alert(1)" } }),
    "visible label"
  );
});

test("readCellText removes controls, trims, collapses whitespace, and truncates", () => {
  assert.equal(readCellText("  Alpha\u0000\t Beta\nGamma  "), "Alpha Beta Gamma");
  assert.equal(readCellText("abcdefgh", { maxLength: 5 }), "abcde");
  assert.equal(readCellText("x".repeat(513)).length, 512);
});

test("escapeForSpreadsheet blocks formula-triggering prefixes", () => {
  const dangerous = [
    "=cmd|' /c calc'!A1",
    "+SUM(A1:A2)",
    "-1+2",
    "@SUM(A1:A2)",
    "\tformula",
    "\rformula",
    "\nformula",
  ];

  for (const value of dangerous) {
    assert.equal(escapeForSpreadsheet(value), `'${value}`);
  }
  assert.equal(escapeForSpreadsheet("ordinary value"), "ordinary value");
});

test("isSafeExternalUrl accepts public HTTPS DNS names only", () => {
  assert.equal(isSafeExternalUrl("https://example.com/resume.pdf"), true);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
  assert.equal(isSafeExternalUrl("http://user:pass@example.com"), false);
  assert.equal(isSafeExternalUrl("https://user:pass@example.com"), false);
  assert.equal(
    isSafeExternalUrl("http://169.254.169.254/latest/meta-data/"),
    false
  );
  assert.equal(
    isSafeExternalUrl("https://169.254.169.254/latest/meta-data/"),
    false
  );
  assert.equal(isSafeExternalUrl("https://10.0.0.1/resume.pdf"), false);
  assert.equal(isSafeExternalUrl("https://127.0.0.1/resume.pdf"), false);
  assert.equal(isSafeExternalUrl("https://localhost/resume.pdf"), false);
  assert.equal(isSafeExternalUrl("https://files.internal/resume.pdf"), false);
});

test("upload limits are fixed", () => {
  assert.equal(MAX_UPLOAD_BYTES, 5 * 1024 * 1024);
  assert.equal(MAX_UPLOAD_ROWS, 5000);
});
