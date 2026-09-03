import { after, NextResponse } from "next/server";
import {
  claimAttorneyDeliveryAttempt,
  issueAndDeliverAttorneyMagicLink,
  normalizeAttorneyEmail,
} from "../../auth";

function deliveryErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Attorney magic-link delivery failed with an unknown error.";
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
  const allowed = await claimAttorneyDeliveryAttempt(normalizedEmail);

  // Enrollment lookup and provider I/O happen only after the identical public
  // redirect is ready. This prevents either operation from becoming a timing
  // oracle. Register an after-task even when throttled to keep this path alike.
  after(async () => {
    if (!allowed) return;
    try {
      await issueAndDeliverAttorneyMagicLink(normalizedEmail);
    } catch (error) {
      // Never log the submitted address or one-time token. Configuration and
      // provider failures remain server-side and cannot reveal enrollment.
      console.error(`Attorney magic-link delivery failed: ${deliveryErrorMessage(error)}`);
    }
  });

  return NextResponse.redirect(
    new URL("/attorney/login?sent=1", request.url),
    303
  );
}
