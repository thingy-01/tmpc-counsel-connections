import { NextResponse } from "next/server";
import {
  consumeAttorneyToken,
  isAttorneyTokenAvailable,
} from "../auth";
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

function isUserInitiatedTopLevelNavigation(request: Request): boolean {
  const headers = request.headers;
  const purpose = `${headers.get("purpose") ?? ""},${headers.get("sec-purpose") ?? ""}`;
  return (
    headers.get("sec-fetch-user") === "?1" &&
    headers.get("sec-fetch-mode") === "navigate" &&
    headers.get("sec-fetch-dest") === "document" &&
    !purpose.toLowerCase().includes("prefetch")
  );
}

function fallbackPostHtml(token: string, action: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Continue to your Counsel Connections schedule</title>
  <style>
    body { margin: 0; background: #f8fafc; color: #0f172a; font: 16px system-ui, sans-serif; }
    main { max-width: 28rem; margin: 12vh auto; padding: 2rem; background: white; border: 1px solid #e2e8f0; border-radius: .75rem; }
    p { color: #475569; line-height: 1.5; }
    button { width: 100%; margin-top: 1rem; padding: .75rem 1rem; border: 0; border-radius: .375rem; background: #0f172a; color: white; font: inherit; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <p>TMCP Counsel Connections</p>
    <h1>Continue to your schedule</h1>
    <p>Use the button below to finish signing in.</p>
    <form action="${action}" method="post">
      <input type="hidden" name="token" value="${token}">
      <button type="submit">Continue to my schedule</button>
    </form>
  </main>
</body>
</html>`;
}

async function redeemAndRedirect(
  request: Request,
  token: string
): Promise<NextResponse> {
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

/**
 * Supporting browsers identify a user-activated top-level navigation, which
 * can redeem directly. Scanner-like and metadata-free GETs remain read-only.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    assertAttorneySessionConfigured();
  } catch {
    return redirectToLogin(request, "unavailable");
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (isUserInitiatedTopLevelNavigation(request)) {
    return redeemAndRedirect(request, token);
  }

  try {
    if (!(await isAttorneyTokenAvailable(token))) {
      return redirectToLogin(request, "invalid");
    }
  } catch {
    return redirectToLogin(request, "unavailable");
  }

  let callbackUrl: string;
  try {
    callbackUrl = publicAppUrl(request, "/attorney/callback").href;
  } catch {
    return redirectToLogin(request, "unavailable");
  }
  return new NextResponse(fallbackPostHtml(token, callbackUrl), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

/** Redeem the token only when the browser submits the callback page. */
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
