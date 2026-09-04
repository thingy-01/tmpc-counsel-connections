import { NextResponse } from "next/server";
import { redeemAttorneyToken } from "../auth";
import {
  assertAttorneySessionConfigured,
  setAttorneySession,
} from "@/lib/session";
import { isSameOriginRequest } from "@/lib/same-origin";
import { publicAppUrl } from "@/lib/public-app-url";

const PRIVATE_HEADERS: Record<string, string> = {
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

async function redeemAndRedirect(
  request: Request,
  token: string
): Promise<NextResponse> {
  let enrollment;
  try {
    enrollment = await redeemAttorneyToken(token);
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

/** Redeem a valid 15-minute link and open the attorney schedule directly. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    assertAttorneySessionConfigured();
  } catch {
    return redirectToLogin(request, "unavailable");
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  return redeemAndRedirect(request, token);
}

/** Support callback pages opened shortly before this direct flow was deployed. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return redirectToLogin(request, "invalid");
  }

  try {
    assertAttorneySessionConfigured();
  } catch {
    return redirectToLogin(request, "unavailable");
  }

  let token = "";
  try {
    const formData = await request.formData();
    const submitted = formData.get("token");
    if (typeof submitted === "string") token = submitted;
  } catch {
    return redirectToLogin(request, "invalid");
  }

  return redeemAndRedirect(request, token);
}
