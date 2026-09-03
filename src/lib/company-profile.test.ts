import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPANY_PORTAL_DEFAULT_PATH,
  COMPANY_PROFILE_ONBOARDING_PATH,
  companyPortalLoginDestination,
  incompleteCompanyProfileRedirect,
  isCompanyProfileComplete,
} from "./company-profile";

test("company profile completeness requires non-blank contact name and email", () => {
  assert.equal(
    isCompanyProfileComplete({
      contactName: "Jordan Lee",
      contactEmail: "jordan@example.com",
    }),
    true
  );

  for (const company of [
    { contactName: null, contactEmail: "jordan@example.com" },
    { contactName: "Jordan Lee", contactEmail: undefined },
    { contactName: "   ", contactEmail: "jordan@example.com" },
    { contactName: "Jordan Lee", contactEmail: "\t" },
  ]) {
    assert.equal(isCompanyProfileComplete(company), false);
  }
});

test("login and feature access share the incomplete-profile onboarding route", () => {
  const incomplete = { contactName: "", contactEmail: null };
  const complete = {
    contactName: "Jordan Lee",
    contactEmail: "jordan@example.com",
  };

  assert.equal(
    companyPortalLoginDestination(incomplete),
    COMPANY_PROFILE_ONBOARDING_PATH
  );
  assert.equal(
    incompleteCompanyProfileRedirect(incomplete),
    COMPANY_PROFILE_ONBOARDING_PATH
  );
  assert.equal(
    companyPortalLoginDestination(complete),
    COMPANY_PORTAL_DEFAULT_PATH
  );
  assert.equal(incompleteCompanyProfileRedirect(complete), null);
});
