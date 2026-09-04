import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
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

function automaticPostHtml(token: string, action: string, nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Opening your Counsel Connections schedule</title>
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
    <h1>Opening your schedule…</h1>
    <p>If your schedule does not open automatically, continue below.</p>
    <form id="attorney-sign-in" action="${action}" method="post">
      <input type="hidden" name="token" value="${token}">
      <button type="submit">Continue to my schedule</button>
    </form>
  </main>
  <script nonce="${nonce}">document.getElementById("attorney-sign-in").requestSubmit();</script>
</body>
</html>`;
}

/**
 * Validate without redeeming so mail scanners cannot consume the token. A real
 * browser immediately submits the same-origin POST that creates the session.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    assertAttorneySessionConfigured();
  } catch {
    return redirectToLogin(request, "unavailable");
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    if (!(await isAttorneyTokenAvailable(token))) {
      return redirectToLogin(request, "invalid");
    }
  } catch {
    return redirectToLogin(request, "unavailable");
  }

  const nonce = randomBytes(16).toString("base64");
  let callbackUrl: string;
  try {
    callbackUrl = publicAppUrl(request, "/attorney/callback").href;
  } catch {
    return redirectToLogin(request, "unavailable");
  }
  return new NextResponse(automaticPostHtml(token, callbackUrl, nonce), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Security-Policy": `${PRIVATE_HEADERS["Content-Security-Policy"]}; script-src 'nonce-${nonce}'`,
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
