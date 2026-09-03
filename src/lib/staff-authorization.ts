export const STAFF_ADMIN_ROLE = "org:admin";

const MEMBERSHIP_PAGE_SIZE = 100;
const MAX_MEMBERSHIP_PAGES = 20;

export type StaffAuthContext = {
  orgId: string | null;
  orgRole: string | null;
};

export type StaffOrganizationMembership = {
  role: string | null;
  organization: { id: string } | null;
};

export type StaffMembershipPage = {
  data: StaffOrganizationMembership[];
  totalCount: number;
};

export function configuredStaffOrganizationId(): string | null {
  const organizationId = process.env.CLERK_ADMIN_ORG_ID?.trim();
  if (organizationId) return organizationId;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "CLERK_ADMIN_ORG_ID is not set. Staff authorization is disabled."
    );
  }
  return null;
}

export function isActiveStaffAdmin(
  authContext: StaffAuthContext,
  organizationId: string | null
): boolean {
  return Boolean(
    organizationId &&
      authContext.orgId === organizationId &&
      authContext.orgRole === STAFF_ADMIN_ROLE
  );
}

export function isStaffAdminMembership(
  membership: StaffOrganizationMembership,
  organizationId: string | null
): boolean {
  return Boolean(
    organizationId &&
      membership.organization?.id === organizationId &&
      membership.role === STAFF_ADMIN_ROLE
  );
}

/**
 * Search a Clerk user's organization memberships without trusting only the
 * first (default-sized) page. The fixed upper bound prevents an unexpected
 * account shape or remote response from creating an unbounded middleware loop.
 */
export async function hasStaffAdminMembership(
  organizationId: string | null,
  fetchPage: (params: {
    limit: number;
    offset: number;
  }) => Promise<StaffMembershipPage>
): Promise<boolean> {
  if (!organizationId) return false;

  let offset = 0;
  for (let pageNumber = 0; pageNumber < MAX_MEMBERSHIP_PAGES; pageNumber += 1) {
    const page = await fetchPage({ limit: MEMBERSHIP_PAGE_SIZE, offset });
    if (
      page.data.some((membership) =>
        isStaffAdminMembership(membership, organizationId)
      )
    ) {
      return true;
    }

    if (page.data.length === 0) return false;
    offset += page.data.length;
    if (offset >= page.totalCount) return false;
  }

  return false;
}
