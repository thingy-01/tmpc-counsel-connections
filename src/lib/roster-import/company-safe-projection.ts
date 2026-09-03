export type PublicAttorneyProjectionInput = {
  id: string;
  firstName: string;
  lastName: string;
  firm: string;
  email: string;
  phone: string | null;
  city: string | null;
  organizationType: string | null;
  practiceAreas: Array<{ area: string; percent: number | null }>;
  status: string;
  hasResume: boolean;
};

export function buildCompanySafeAttorneys(
  attorneys: PublicAttorneyProjectionInput[],
  ownAttorneyIds: ReadonlySet<string>,
  unavailableByAttorney: ReadonlyMap<string, ReadonlySet<string>>,
  referencesByAttorney: ReadonlyMap<string, Array<{ url: string; label: string }>>
) {
  return attorneys
    .filter((attorney) => attorney.status !== "withdrawn" || ownAttorneyIds.has(attorney.id))
    .map((attorney) => ({
      id: attorney.id,
      firstName: attorney.firstName,
      lastName: attorney.lastName,
      firm: attorney.firm,
      city: attorney.city,
      organizationType: attorney.organizationType,
      practiceAreas: attorney.practiceAreas,
      status: attorney.status === "withdrawn" ? ("withdrawn" as const) : ("active" as const),
      hasResume: attorney.hasResume,
      resumeReferences: referencesByAttorney.get(attorney.id) ?? [],
      unavailableSlotIds: Array.from(unavailableByAttorney.get(attorney.id) ?? []),
      ...(ownAttorneyIds.has(attorney.id)
        ? { contact: { email: attorney.email, phone: attorney.phone } }
        : {}),
    }));
}
