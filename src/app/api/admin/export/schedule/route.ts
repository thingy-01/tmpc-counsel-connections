import { getRole } from "@/lib/auth";
import {
  buildScheduleExportResponse,
  NO_STORE_EXPORT_HEADERS,
} from "./response";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if ((await getRole()) !== "admin") {
    return new Response("Admin access required.", {
      status: 403,
      headers: NO_STORE_EXPORT_HEADERS,
    });
  }
  const eventId = new URL(request.url).searchParams.get("eventId")?.trim();
  if (!eventId) {
    return new Response("eventId is required.", {
      status: 400,
      headers: NO_STORE_EXPORT_HEADERS,
    });
  }
  return buildScheduleExportResponse(eventId);
}
