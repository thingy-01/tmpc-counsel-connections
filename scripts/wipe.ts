/**
 * Wipe ALL event data (events, days, slots, attorneys, companies, assignments…).
 * Admin users are kept. Resume files on disk are NOT touched.
 *
 * Run with: npx tsx scripts/wipe.ts --yes
 *
 * Requires DATABASE_URL in .env.local or the environment. The same wipe is
 * available per-event in the admin UI under Settings → Danger Zone.
 */

import * as dotenv from "dotenv";
import * as fs from "fs";

const envPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
dotenv.config({ path: envPath });

import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/db/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not configured.");
  process.exit(1);
}

if (!process.argv.includes("--yes")) {
  console.error(
    "This deletes ALL events, attorneys, companies, and assignments.\n" +
      "Re-run with --yes to confirm:  npx tsx scripts/wipe.ts --yes"
  );
  process.exit(1);
}

const db = DATABASE_URL.includes("neon.tech")
  ? drizzleNeon(neon(DATABASE_URL), { schema })
  : (drizzlePg(new Pool({ connectionString: DATABASE_URL }), {
      schema,
    }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>);

async function main() {
  // events cascades to event_days, time_slots, break_periods, attorneys,
  // attorney_unavailability, companies, company_interviewers,
  // company_slot_selections, and assignments.
  const deleted = await db.delete(schema.events).returning({ id: schema.events.id });
  console.log(`🧹 Deleted ${deleted.length} event(s) and all related data.`);
  console.log("   Admin users were kept. Create a new event in /admin/events.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
