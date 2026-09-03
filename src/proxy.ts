import {
  clerkClient,
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { getDevAuth } from "@/lib/dev-auth";
import {
  configuredStaffOrganizationId,
  hasStaffAdminMembership,
  isActiveStaffAdmin,
} from "@/lib/staff-authorization";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export function isIndependentAttorneyPath(pathname: string): boolean {
  return pathname === "/attorney" || pathname.startsWith("/attorney/");
}

const clerk = clerkMiddleware(async (auth, req) => {
  // Only /admin requires Clerk. The company portal and the resume route use the
  // email-free invite-code session and are gated in-app (see src/lib/auth.ts),
  // so we never force a Clerk sign-in (and its email step) on them.
  if (isAdminRoute(req)) {
    const { userId, orgId, orgRole, redirectToSignIn } = await auth();
    if (!userId) return redirectToSignIn();

    // orgRole only reflects the *active* org, which Clerk may not set. Accept it
    // as a fast path, otherwise check the user's full membership list so a TMCP
    // admin reaches /admin no matter which org is active.
    const organizationId = configuredStaffOrganizationId();
    if (
      isActiveStaffAdmin(
        { orgId: orgId ?? null, orgRole: orgRole ?? null },
        organizationId
      )
    ) {
      return;
    }
    try {
      const client = await clerkClient();
      const isAdmin = await hasStaffAdminMembership(
        organizationId,
        async ({ limit, offset }) => {
          const page = await client.users.getOrganizationMembershipList({
            userId,
            limit,
            offset,
          });
          return {
            data: page.data.map((membership) => ({
              role: membership.role,
              organization: membership.organization
                ? { id: membership.organization.id }
                : null,
            })),
            totalCount: page.totalCount,
          };
        }
      );
      if (isAdmin) return;
    } catch {
      // fall through to redirect
    }
    // Signed in but not a TMCP admin — send them to the company portal.
    return NextResponse.redirect(new URL("/portal", req.url));
  }
});

// Local dev with DEV_AUTH set: skip Clerk entirely (no keys needed).
const passthrough = () => NextResponse.next();

const clerkOrDevelopmentProxy = getDevAuth() ? passthrough : clerk;

/** Keep the independently authenticated attorney tree outside Clerk entirely. */
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isIndependentAttorneyPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  return clerkOrDevelopmentProxy(request, event);
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static files…
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // …always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
