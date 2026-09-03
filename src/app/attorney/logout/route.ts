import { NextResponse } from "next/server";
import { clearAttorneySession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/same-origin";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  await clearAttorneySession();
  return NextResponse.redirect(new URL("/attorney/login", request.url), 303);
}
