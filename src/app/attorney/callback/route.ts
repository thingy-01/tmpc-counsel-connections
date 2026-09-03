import { NextResponse } from "next/server";
import { consumeAttorneyToken } from "../auth";
import {
  assertAttorneySessionConfigured,
  setAttorneySession,
} from "@/lib/session";
import { publicAppUrl } from "@/lib/public-app-url";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function redirectToLogin(request: Request, error: "invalid" | "unavailable") {
  return NextResponse.redirect(
    publicAppUrl(request, `/attorney/login?error=${error}`),
    { status: 303, headers: PRIVATE_HEADERS }
  );
}

/** Redeem the emailed one-use token and open the attorney's schedule directly. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    assertAttorneySessionConfigured();
  } catch {
    return redirectToLogin(request, "unavailable");
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  let enrollment;
  try {
    enrollment = await consumeAttorneyToken(token);
  } catch {
    return redirectToLogin(request, "unavailable");
  }
  if (!enrollment) return redirectToLogin(request, "invalid");

  try {
    await setAttorneySession(enrollment.attorneyId, enrollment.eventId);
  } catch {
    return redirectToLogin(request, "unavailable");
  }
  return NextResponse.redirect(publicAppUrl(request, "/attorney/schedule"), {
    status: 303,
    headers: PRIVATE_HEADERS,
  });
}
