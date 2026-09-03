export type CompanyProfileContact = {
  contactName: string | null | undefined;
  contactEmail: string | null | undefined;
};

export const COMPANY_PROFILE_ONBOARDING_PATH =
  "/portal/profile?onboarding=1";
export const COMPANY_PORTAL_DEFAULT_PATH = "/portal/schedule";

/** The single onboarding-completeness rule shared by login and portal UI. */
export function isCompanyProfileComplete(company: CompanyProfileContact): boolean {
  return Boolean(company.contactName?.trim() && company.contactEmail?.trim());
}

/** The destination for a company immediately after a successful login. */
export function companyPortalLoginDestination(
  company: CompanyProfileContact
): string {
  return isCompanyProfileComplete(company)
    ? COMPANY_PORTAL_DEFAULT_PATH
    : COMPANY_PROFILE_ONBOARDING_PATH;
}

/** Redirect target for protected company features, or null when access is ready. */
export function incompleteCompanyProfileRedirect(
  company: CompanyProfileContact
): string | null {
  return isCompanyProfileComplete(company)
    ? null
    : COMPANY_PROFILE_ONBOARDING_PATH;
}
