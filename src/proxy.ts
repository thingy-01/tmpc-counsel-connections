import {
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const ADMIN_ORG_ROLE = "org:admin";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isProtectedRoute = createRouteMatcher([
  "/portal(.*)",
  "/api/attorneys/(.*)/resume",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, orgRole, redirectToSignIn } = await auth();

  if (isAdminRoute(req)) {
    if (!userId) return redirectToSignIn();
    // Signed in but not a TMCP admin — send them to the company portal.
    if (orgRole !== ADMIN_ORG_ROLE) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }

  if (isProtectedRoute(req)) {
    if (!userId) return redirectToSignIn();
  }
});

export const config = {
  matcher: [
    // Run on everything except Next internals and static files…
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // …always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
