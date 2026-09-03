import { NextResponse } from "next/server";
import { consumeAttorneyToken } from "../auth";
import {
  assertAttorneySessionConfigured,
  setAttorneySession,
} from "@/lib/session";

export async function GET(request: Request): Promise<NextResponse> {
  // Fail clearly before consuming a single-use token if session signing is not
  // configured. In production there is no development-secret fallback.
  assertAttorneySessionConfigured();

  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token") ?? "";
  const enrollment = await consumeAttorneyToken(token);
  if (!enrollment) {
    return NextResponse.redirect(
      new URL("/attorney/login?error=invalid", request.url),
      303
    );
  }

  await setAttorneySession(enrollment.attorneyId, enrollment.eventId);
  return NextResponse.redirect(new URL("/attorney", request.url), 303);
}
