import assert from "node:assert/strict";
import test from "node:test";
import type { AudienceAttorney } from "./types";
import { buildPreview, previewHash, sourceHash } from "./preview";

function attorney(overrides: Partial<AudienceAttorney> = {}): AudienceAttorney {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.test",
    phone: "555-0100",
    firm: "Stone Law",
    conflicts: null,
    status: "active",
    schedule: [
      {
        assignmentId: "00000000-0000-4000-8000-000000000101",
        dayDate: "2026-10-06",
        dayLabel: "Tuesday, October 6",
        dayFormat: "virtual",
        startTime: "16:15:00",
        endTime: "16:30:00",
        companyName: "Example Company",
        interviewerName: "Jordan Lee",
        preferredPlatform: "zoom",
        notes: null,
      },
    ],
    ...overrides,
  };
}

const previewInput = {
  eventName: "Counsel Connections Test",
  portalUrl: "https://example.test/attorney/login",
  subjectTemplate: "Schedule for {{full_name}}",
  bodyTemplate: "Hello {{first_name}}\n\n{{schedule}}\n\n{{portal_url}}",
};

test("ambiguous normalized emails block every matching attorney", () => {
  const first = attorney();
  const second = attorney({
    id: "00000000-0000-4000-8000-000000000002",
    firstName: "Blake",
    email: "  AVERY@EXAMPLE.TEST ",
  });
  let key = 0;
  const preview = buildPreview({
    ...previewInput,
    attorneys: [first, second],
    makeIdempotencyKey: () => `key-${++key}`,
  });
  assert.equal(preview.recipients.length, 2);
  assert.deepEqual(
    preview.recipients.map((recipient) => recipient.status),
    ["blocked_ambiguous", "blocked_ambiguous"]
  );
});

test("a duplicate attorney is skipped while its one canonical row remains sendable", () => {
  const same = attorney();
  const preview = buildPreview({
    ...previewInput,
    attorneys: [same, same],
    makeIdempotencyKey: () => "stable-key",
  });
  assert.equal(preview.recipients.length, 1);
  assert.equal(preview.recipients[0].status, "pending");
  assert.deepEqual(preview.skippedDuplicateAttorneyIds, [same.id]);
});

test("preview is a stored-content snapshot and hashes all recipient content", () => {
  const source = attorney();
  const preview = buildPreview({
    ...previewInput,
    attorneys: [source],
    makeIdempotencyKey: () => "stable-key",
  });
  const storedBody = preview.recipients[0].renderedBody;
  const storedHash = previewHash(preview.recipients);
  source.schedule[0].companyName = "Changed After Preview";
  assert.equal(preview.recipients[0].renderedBody, storedBody);
  assert.equal(previewHash(preview.recipients), storedHash);

  const before = sourceHash({
    event: { id: "event", name: "Event", location: null, status: "open" },
    audience: { kind: "all_active" },
    attorneys: [attorney()],
  });
  const after = sourceHash({
    event: { id: "event", name: "Event", location: null, status: "open" },
    audience: { kind: "all_active" },
    attorneys: [source],
  });
  assert.notEqual(before, after);
});
