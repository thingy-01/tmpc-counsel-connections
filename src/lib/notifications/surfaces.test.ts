import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { adminNavItems } from "@/lib/admin-nav";

test("every Wave 2 admin route is reachable from navigation", async () => {
  const eventId = "event-id";
  const items = adminNavItems(eventId);
  const expected = [
    [`/admin/events/${eventId}/roster-import`, "src/app/admin/events/[eventId]/roster-import/page.tsx"],
    [`/admin/events/${eventId}/requests`, "src/app/admin/events/[eventId]/requests/page.tsx"],
    [`/admin/events/${eventId}/notifications`, "src/app/admin/events/[eventId]/notifications/page.tsx"],
    [`/admin/events/${eventId}/assignments`, "src/app/admin/events/[eventId]/assignments/page.tsx"],
  ] as const;
  for (const [href, path] of expected) {
    assert.ok(items.some((item) => item.href === href), href);
    await access(path);
  }
});

test("shared print rules provide a Letter master-schedule surface", async () => {
  const [css, page] = await Promise.all([
    readFile("src/app/globals.css", "utf8"),
    readFile("src/app/admin/events/[eventId]/assignments/page.tsx", "utf8"),
  ]);
  assert.match(css, /@media print/);
  assert.match(css, /size:\s*Letter landscape/);
  assert.match(css, /\.master-schedule-print/);
  assert.match(page, /Printable master schedule/);
  assert.match(page, /<PrintButton/);
});
