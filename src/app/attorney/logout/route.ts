import { NextResponse } from "next/server";
import { clearAttorneySession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/same-origin";
import { publicAppUrl } from "@/lib/public-app-url";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  await clearAttorneySession();
  return NextResponse.redirect(publicAppUrl(request, "/attorney/login"), 303);
}
