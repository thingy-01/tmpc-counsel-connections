import assert from "node:assert/strict";
import test from "node:test";
import { safeResumeReferenceHref } from "./resume-reference";

test("resume reference rendering permits only the existing safe HTTPS policy", () => {
  const valid = "https://files.example.com/resume.pdf";
  assert.equal(safeResumeReferenceHref(valid), valid);
  assert.equal(safeResumeReferenceHref("javascript:alert(1)"), null);
  assert.equal(safeResumeReferenceHref("https://user:pass@example.com/resume"), null);
  assert.equal(safeResumeReferenceHref("https://127.0.0.1/resume"), null);
  assert.equal(safeResumeReferenceHref("https://files.internal/resume"), null);
  assert.equal(safeResumeReferenceHref("not a url"), null);
});
