import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScheduleExportResponse,
  type ScheduleExportDependencies,
} from "./response";
import { NotificationEventNotFoundError } from "@/lib/notifications/data";

const emptyTable = {
  headers: ["First Name"],
  rows: [] as string[][],
  groupCount: 0,
  overflowAttorneys: [],
};

function dependencies(
  overrides: Partial<ScheduleExportDependencies> = {}
): ScheduleExportDependencies {
  return {
    loadAttorneys: async () => [],
    buildTable: () => emptyTable,
    writeWorkbook: () => Buffer.from("synthetic workbook"),
    logFailure: () => undefined,
    ...overrides,
  };
}

test("schedule export returns a no-store 404 only for a missing event", async () => {
  const response = await buildScheduleExportResponse(
    "missing-event",
    dependencies({
      loadAttorneys: async () => {
        throw new NotificationEventNotFoundError();
      },
    })
  );
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(await response.text(), "Event not found.");
});

test("schedule export sanitizes unexpected failures as a no-store 500", async () => {
  const logged: string[] = [];
  const response = await buildScheduleExportResponse(
    "event-id",
    dependencies({
      writeWorkbook: () => {
        throw new Error("synthetic private database details");
      },
      logFailure: (code) => logged.push(code),
    })
  );
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(await response.text(), "Schedule export failed.");
  assert.deepEqual(logged, ["schedule_export_failed"]);
  assert.doesNotMatch(logged.join("\n"), /synthetic private database details/);
});

test("schedule export produces a workbook response through injected helpers", async () => {
  const response = await buildScheduleExportResponse(
    "event/id",
    dependencies()
  );
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-disposition") ?? "",
    /counsel-connections-event-id-assignments\.xlsx/
  );
  assert.equal(response.headers.get("x-interview-group-count"), "0");
});
