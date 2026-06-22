import {
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDevAuth } from "@/lib/dev-auth";

const ADMIN_ORG_ROLE = "org:admin";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

const clerk = clerkMiddleware(async (auth, req) => {
  // Only /admin requires Clerk. The company portal and the resume route use the
  // email-free invite-code session and are gated in-app (see src/lib/auth.ts),
  // so we never force a Clerk sign-in (and its email step) on them.
  if (isAdminRoute(req)) {
    const { userId, orgRole, redirectToSignIn } = await auth();
    if (!userId) return redirectToSignIn();
    // Signed in but not a TMCP admin — send them to the company portal.
    if (orgRole !== ADMIN_ORG_ROLE) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }
});

// Local dev with DEV_AUTH set: skip Clerk entirely (no keys needed).
const passthrough = () => NextResponse.next();

export default getDevAuth() ? passthrough : clerk;

export const config = {
  matcher: [
    // Run on everything except Next internals and static files…
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // …always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
