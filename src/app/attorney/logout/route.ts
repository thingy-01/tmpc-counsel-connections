import { NextResponse } from "next/server";
import { clearAttorneySession } from "@/lib/session";

export async function POST(request: Request): Promise<NextResponse> {
  await clearAttorneySession();
  return NextResponse.redirect(new URL("/attorney/login", request.url), 303);
}
