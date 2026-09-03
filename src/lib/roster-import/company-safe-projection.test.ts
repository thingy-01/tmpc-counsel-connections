import assert from "node:assert/strict";
import test from "node:test";
import { buildCompanySafeAttorneys } from "./company-safe-projection";

test("company projection includes external references without private notes or another company's identifiers", () => {
  const raw = [{
    id: "attorney-safe",
    firstName: "Quinn",
    lastName: "Projection",
    firm: "Synthetic LLP",
    email: "quinn@example.test",
    phone: null,
    city: "Austin",
    organizationType: null,
    practiceAreas: [{ area: "Taxation", percent: 100 }],
    status: "active",
    hasResume: false,
    unavailableNote: "SENTINEL_PRIVATE_UNAVAILABILITY_NOTE",
    staffNote: "SENTINEL_STAFF_NOTE",
    otherCompanyId: "SENTINEL_OTHER_COMPANY_ID",
  }];
  const projected = buildCompanySafeAttorneys(
    raw,
    new Set<string>(),
    new Map([["attorney-safe", new Set(["slot-generic"])]]),
    new Map([["attorney-safe", [{ url: "https://resumes.example.test/quinn", label: "Unverified external reference" }]]])
  );
  const serialized = JSON.stringify(projected);
  assert.match(serialized, /https:\/\/resumes\.example\.test\/quinn/);
  assert.match(serialized, /slot-generic/);
  assert.doesNotMatch(serialized, /SENTINEL_PRIVATE_UNAVAILABILITY_NOTE|SENTINEL_STAFF_NOTE|SENTINEL_OTHER_COMPANY_ID/);
  assert.doesNotMatch(serialized, /quinn@example\.test/);
});
