export type CompanyProfileContact = {
  contactName: string | null | undefined;
  contactEmail: string | null | undefined;
};

/** The single onboarding-completeness rule shared by login and portal UI. */
export function isCompanyProfileComplete(company: CompanyProfileContact): boolean {
  return Boolean(company.contactName?.trim() && company.contactEmail?.trim());
}
