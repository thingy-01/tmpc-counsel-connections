import * as XLSX from "xlsx";
import {
  loadMailMergeAttorneys,
  NotificationEventNotFoundError,
} from "@/lib/notifications/data";
import { buildMailMergeTable } from "@/lib/notifications/mail-merge";
import type { MailMergeAttorney } from "@/lib/notifications/mail-merge";

export const NO_STORE_EXPORT_HEADERS = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
};

type ScheduleExportTable = ReturnType<typeof buildMailMergeTable>;

export type ScheduleExportDependencies = {
  loadAttorneys: (eventId: string) => Promise<MailMergeAttorney[]>;
  buildTable: (attorneys: MailMergeAttorney[]) => ScheduleExportTable;
  writeWorkbook: (table: ScheduleExportTable) => Buffer;
  logFailure: (operationCode: "schedule_export_failed") => void;
};

function writeScheduleWorkbook(table: ScheduleExportTable): Buffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Assignments");
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

const DEFAULT_DEPENDENCIES: ScheduleExportDependencies = {
  loadAttorneys: loadMailMergeAttorneys,
  buildTable: buildMailMergeTable,
  writeWorkbook: writeScheduleWorkbook,
  logFailure: (operationCode) => console.error(operationCode),
};

export async function buildScheduleExportResponse(
  eventId: string,
  dependencies: ScheduleExportDependencies = DEFAULT_DEPENDENCIES
): Promise<Response> {
  const filenameEventId = eventId.replace(/[^A-Za-z0-9._-]/g, "-");
  try {
    const attorneys = await dependencies.loadAttorneys(eventId);
    const table = dependencies.buildTable(attorneys);
    const bytes = dependencies.writeWorkbook(table);
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...NO_STORE_EXPORT_HEADERS,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="counsel-connections-${filenameEventId}-assignments.xlsx"`,
        "X-Interview-Group-Count": String(table.groupCount),
        "X-Overflow-Attorney-Count": String(table.overflowAttorneys.length),
      },
    });
  } catch (error) {
    if (error instanceof NotificationEventNotFoundError) {
      return new Response("Event not found.", {
        status: 404,
        headers: NO_STORE_EXPORT_HEADERS,
      });
    }
    dependencies.logFailure("schedule_export_failed");
    return new Response("Schedule export failed.", {
      status: 500,
      headers: NO_STORE_EXPORT_HEADERS,
    });
  }
}
