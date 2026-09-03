import * as XLSX from "xlsx";
import { getRole } from "@/lib/auth";
import { loadMailMergeAttorneys } from "@/lib/notifications/data";
import { buildMailMergeTable } from "@/lib/notifications/mail-merge";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
};

export async function GET(request: Request): Promise<Response> {
  if ((await getRole()) !== "admin") {
    return new Response("Admin access required.", {
      status: 403,
      headers: NO_STORE_HEADERS,
    });
  }
  const eventId = new URL(request.url).searchParams.get("eventId")?.trim();
  if (!eventId) {
    return new Response("eventId is required.", {
      status: 400,
      headers: NO_STORE_HEADERS,
    });
  }
  const filenameEventId = eventId.replace(/[^A-Za-z0-9._-]/g, "-");
  try {
    const attorneys = await loadMailMergeAttorneys(eventId);
    const table = buildMailMergeTable(attorneys);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Assignments");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="counsel-connections-${filenameEventId}-assignments.xlsx"`,
        "X-Interview-Group-Count": String(table.groupCount),
        "X-Overflow-Attorney-Count": String(table.overflowAttorneys.length),
      },
    });
  } catch {
    return new Response("Event not found.", {
      status: 404,
      headers: NO_STORE_HEADERS,
    });
  }
}
