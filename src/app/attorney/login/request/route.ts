import { after, NextResponse } from "next/server";
import {
  claimAttorneyDeliveryAttempt,
  cleanupExpiredAttorneyAuthRows,
  isPlausibleAttorneyEmail,
  issueAndDeliverAttorneyMagicLink,
  normalizeAttorneyEmail,
} from "../../auth";
import { logAttorneyAuthFailure } from "../../safe-logging";

function genericResponse(request: Request): NextResponse {
  return NextResponse.redirect(
    new URL("/attorney/login?sent=1", request.url),
    303
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  let submittedEmail = "";
  try {
    const formData = await request.formData();
    const value = formData.get("email");
    if (typeof value === "string") submittedEmail = value;
  } catch {
    // Malformed bodies follow the same public response path as every address.
  }

  const normalizedEmail = normalizeAttorneyEmail(submittedEmail);
  if (!isPlausibleAttorneyEmail(normalizedEmail)) {
    return genericResponse(request);
  }

  let allowed: boolean;
  try {
    allowed = await claimAttorneyDeliveryAttempt(normalizedEmail);
  } catch (error) {
    logAttorneyAuthFailure("rate_limit", error);
    return genericResponse(request);
  }

  // Enrollment lookup and provider I/O happen only after the identical public
  // redirect is ready. This prevents either operation from becoming a timing
  // oracle. Register an after-task even when throttled to keep this path alike.
  after(async () => {
    try {
      await cleanupExpiredAttorneyAuthRows();
    } catch (error) {
      logAttorneyAuthFailure("cleanup", error);
    }
    if (!allowed) return;
    try {
      await issueAndDeliverAttorneyMagicLink(normalizedEmail);
    } catch (error) {
      // Never log the submitted address or one-time token. Configuration and
      // provider failures remain server-side and cannot reveal enrollment.
      logAttorneyAuthFailure("delivery", error);
    }
  });

  return genericResponse(request);
}
