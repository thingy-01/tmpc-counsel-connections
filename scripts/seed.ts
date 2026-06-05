/**
 * Seed script for TMCP Counsel Connections 2025
 *
 * Reads the sample data from the data/ folder and populates the database.
 * Run with: npx tsx scripts/seed.ts
 *
 * Requires DATABASE_URL to be set in .env.local or environment.
 */

import * as dotenv from "dotenv";
import * as fs from "fs";

// Load .env.local first, fall back to .env
const envPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
dotenv.config({ path: envPath });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and } from "drizzle-orm";
import * as XLSX from "xlsx";
import * as path from "path";
import * as schema from "../src/lib/db/schema";

// ============================================================
// Setup
// ============================================================

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || DATABASE_URL.includes("placeholder") || DATABASE_URL.includes("user:password")) {
  console.error("❌ DATABASE_URL is not configured. Set it in .env.local before running the seed script.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const db = drizzle(sql, { schema });

const DATA_DIR = path.join(__dirname, "..", "data");

// ============================================================
// Helpers
// ============================================================

/**
 * Parse a time string like "2:00 p.m." or "10:45 a.m." to "14:00" or "10:45" (24h format)
 */
function parseTimeString(timeStr: string): string {
  // Normalize: remove extra spaces, fix "p.m." / "a.m."
  const normalized = timeStr.trim().replace(/\s+/g, " ").toLowerCase();

  // Extract hours, minutes, and period
  const match = normalized.match(/(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)/);
  if (!match) {
    throw new Error(`Cannot parse time: "${timeStr}"`);
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3];

  if (period.startsWith("p") && hours !== 12) hours += 12;
  if (period.startsWith("a") && hours === 12) hours = 0;

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Parse a time range like "10:45 a.m. - 11:00 a.m." or "4:30 - 4:45 p.m."
 */
function parseTimeRange(rangeStr: string): { start: string; end: string } {
  const normalized = rangeStr.trim().replace(/\s+/g, " ");

  // Split on " - "
  const parts = normalized.split(/\s*-\s*/);
  if (parts.length !== 2) {
    throw new Error(`Cannot parse time range: "${rangeStr}"`);
  }

  let startStr = parts[0].trim();
  const endStr = parts[1].trim();

  // If start doesn't have a.m./p.m., infer from end
  if (!startStr.match(/[ap]\.?m\.?/i)) {
    const endPeriod = endStr.match(/([ap]\.?m\.?)/i);
    if (endPeriod) {
      startStr += " " + endPeriod[1];
    }
  }

  return {
    start: parseTimeString(startStr),
    end: parseTimeString(endStr),
  };
}

/**
 * Parse interviewer string like "Interviewer: Inya Baiye" or "Interviewers: Spoorthy Gudavalli & Timothy Kim"
 * Returns array of interviewer names.
 */
function parseInterviewerString(str: string): string[] {
  if (!str) return [];
  // Remove "Interviewer:" / "Interviewers:" prefix
  const cleaned = str.replace(/^interviewers?:\s*/i, "").trim();
  // Split on " & " or " and "
  return cleaned.split(/\s*(?:&|and)\s*/).map((n) => n.trim()).filter(Boolean);
}

/**
 * Map date label to actual date
 */
function dateLabelToDate(label: string): string {
  const mapping: Record<string, string> = {
    "Monday, October 6": "2025-10-06",
    "Tuesday, October 7": "2025-10-07",
    "Wednesday, October 8": "2025-10-08",
    "Thursday, October 9": "2025-10-09",
  };
  const result = mapping[label.trim()];
  if (!result) throw new Error(`Unknown date label: "${label}"`);
  return result;
}

// ============================================================
// Main seed function
// ============================================================

async function seed() {
  console.log("🌱 Starting seed...\n");

  // ----------------------------------------------------------
  // 1. Create the 2025 event
  // ----------------------------------------------------------
  console.log("📅 Creating event...");
  const [event] = await db
    .insert(schema.events)
    .values({
      name: "33rd Annual TMCP 2025",
      description: "Texas Minority Counsel Program — Counsel Connections 2025",
      location: "Renaissance Dallas Hotel, Dallas, TX",
      startDate: "2025-10-06",
      endDate: "2025-10-09",
      slotDuration: 15,
      status: "open",
    })
    .returning();
  console.log(`  ✓ Event created: ${event.name} (${event.id})`);

  // ----------------------------------------------------------
  // 2. Create event days
  // ----------------------------------------------------------
  console.log("\n📆 Creating event days...");

  const dayConfigs = [
    {
      date: "2025-10-06",
      label: "Monday, October 6",
      format: "virtual" as const,
      startTime: "09:00",
      endTime: "17:00",
      breaks: [
        { start: "11:15", end: "11:30", label: "Break" },
        { start: "12:15", end: "12:30", label: "Break" },
        { start: "12:45", end: "01:30", label: "Lunch Break" },
        // The data shows slots at 10:00-11:15, 11:30-12:45, 1:30-2:00, 4:30-4:45
        // There are gaps — this is a flexible virtual day
      ],
    },
    {
      date: "2025-10-07",
      label: "Tuesday, October 7",
      format: "in_person" as const,
      startTime: "14:00",
      endTime: "17:00",
      breaks: [
        { start: "15:30", end: "15:45", label: "Conference Break" },
      ],
    },
    {
      date: "2025-10-08",
      label: "Wednesday, October 8",
      format: "in_person" as const,
      startTime: "13:45",
      endTime: "17:00",
      breaks: [
        { start: "15:30", end: "15:45", label: "Conference Break" },
      ],
    },
    {
      date: "2025-10-09",
      label: "Thursday, October 9",
      format: "in_person" as const,
      startTime: "09:00",
      endTime: "12:00",
      breaks: [
        { start: "10:30", end: "10:45", label: "Conference Break" },
      ],
    },
  ];

  const eventDaysMap = new Map<string, typeof schema.eventDays.$inferSelect>();

  for (const dc of dayConfigs) {
    const [day] = await db
      .insert(schema.eventDays)
      .values({
        eventId: event.id,
        date: dc.date,
        label: dc.label,
        format: dc.format,
        startTime: dc.startTime,
        endTime: dc.endTime,
      })
      .returning();

    eventDaysMap.set(dc.date, day);
    console.log(`  ✓ ${dc.label} (${dc.format}): ${dc.startTime}-${dc.endTime}`);

    // Create break periods
    for (const brk of dc.breaks) {
      await db.insert(schema.breakPeriods).values({
        eventDayId: day.id,
        startTime: brk.start,
        endTime: brk.end,
        label: brk.label,
      });
    }
  }

  // ----------------------------------------------------------
  // 3. Generate time slots
  // ----------------------------------------------------------
  console.log("\n⏱️  Generating time slots...");

  const timeSlotsMap = new Map<string, typeof schema.timeSlots.$inferSelect>();

  for (const dc of dayConfigs) {
    const day = eventDaysMap.get(dc.date)!;
    const breaks = dc.breaks;

    // Parse start/end as minutes from midnight
    const toMinutes = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };

    let currentMin = toMinutes(dc.startTime);
    const endMin = toMinutes(dc.endTime);
    let order = 0;

    while (currentMin + 15 <= endMin) {
      const slotStart = `${Math.floor(currentMin / 60).toString().padStart(2, "0")}:${(currentMin % 60).toString().padStart(2, "0")}`;
      const slotEnd = `${Math.floor((currentMin + 15) / 60).toString().padStart(2, "0")}:${((currentMin + 15) % 60).toString().padStart(2, "0")}`;

      // Check if this slot overlaps any break
      const overlapsBreak = breaks.some((b) => {
        const bStart = toMinutes(b.start);
        const bEnd = toMinutes(b.end);
        return currentMin < bEnd && currentMin + 15 > bStart;
      });

      if (!overlapsBreak) {
        const [slot] = await db
          .insert(schema.timeSlots)
          .values({
            eventDayId: day.id,
            startTime: slotStart,
            endTime: slotEnd,
            sortOrder: order++,
          })
          .returning();

        // Key: "2025-10-07|14:00" for lookup during assignment import
        const key = `${dc.date}|${slotStart}`;
        timeSlotsMap.set(key, slot);
      }

      currentMin += 15;
    }

    console.log(`  ✓ ${dc.label}: ${order} slots generated`);
  }

  // ----------------------------------------------------------
  // 4. Import attorneys from 03C spreadsheet
  // ----------------------------------------------------------
  console.log("\n👨‍⚖️ Importing attorneys...");

  const attorneysWb = XLSX.readFile(
    path.join(
      DATA_DIR,
      "03-availability-selection",
      "03C_Breakdown of Law Firm Attorneys - Counsel Connections 2025 (9.30.25).xlsx"
    )
  );
  const attorneysWs = attorneysWb.Sheets[attorneysWb.SheetNames[0]];
  const attorneysRaw = XLSX.utils.sheet_to_json(attorneysWs, { header: 1 }) as unknown[][];

  // Group rows by attorney (same name+firm = same attorney, multiple practice areas)
  interface AttorneyData {
    firstName: string;
    lastName: string;
    firm: string;
    city: string;
    organizationType: string;
    partnerCount: number;
    associateCount: number;
    ofCounselCount: number;
    practiceAreas: Array<{ area: string; percent: number }>;
  }

  const attorneyMap = new Map<string, AttorneyData>();

  for (let i = 1; i < attorneysRaw.length; i++) {
    const row = attorneysRaw[i];
    if (!row || !row[2]) continue; // Skip empty rows

    const practiceArea = row[0] as string;
    const percent = row[1] as number;
    const firstName = (row[2] as string).trim();
    const lastName = (row[3] as string).trim();
    const firm = (row[4] as string).trim();
    const city = (row[5] as string)?.trim() || "";
    const orgType = (row[6] as string)?.trim() || "";
    const partners = (row[7] as number) || 0;
    const associates = (row[8] as number) || 0;
    const ofCounsel = (row[9] as number) || 0;

    const key = `${firstName}|${lastName}|${firm}`;

    if (!attorneyMap.has(key)) {
      attorneyMap.set(key, {
        firstName,
        lastName,
        firm,
        city,
        organizationType: orgType,
        partnerCount: partners,
        associateCount: associates,
        ofCounselCount: ofCounsel,
        practiceAreas: [],
      });
    }

    attorneyMap.get(key)!.practiceAreas.push({
      area: practiceArea,
      percent: percent,
    });
  }

  // We also need emails/phones from the assignments spreadsheet
  const assignmentsWb = XLSX.readFile(
    path.join(DATA_DIR, "04-assignments", "04_Assignments - Counsel Connections 2025.xlsx")
  );

  // Build a lookup of email/phone by name from all sheets
  const emailPhoneLookup = new Map<string, { email: string; phone: string }>();

  for (const sheetName of assignmentsWb.SheetNames) {
    const ws = assignmentsWb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      const firstName = (row[0] as string).trim();
      const lastName = (row[1] as string).trim();
      const phone = (row[2] as string)?.toString().trim() || "";
      const email = (row[3] as string)?.trim() || "";
      emailPhoneLookup.set(`${firstName}|${lastName}`, { email, phone });
    }
  }

  // Insert attorneys
  const dbAttorneysMap = new Map<string, typeof schema.attorneys.$inferSelect>();

  for (const [key, data] of attorneyMap) {
    const nameParts = key.split("|");
    const contactInfo = emailPhoneLookup.get(`${nameParts[0]}|${nameParts[1]}`);
    const email = contactInfo?.email || `${data.firstName.toLowerCase()}.${data.lastName.toLowerCase()}@placeholder.com`;

    try {
      const [attorney] = await db
        .insert(schema.attorneys)
        .values({
          eventId: event.id,
          firstName: data.firstName,
          lastName: data.lastName,
          email,
          phone: contactInfo?.phone || null,
          firm: data.firm,
          city: data.city,
          organizationType: data.organizationType,
          practiceAreas: data.practiceAreas,
          partnerCount: data.partnerCount,
          associateCount: data.associateCount,
          ofCounselCount: data.ofCounselCount,
          status: "active",
        })
        .returning();

      dbAttorneysMap.set(`${data.firstName}|${data.lastName}`, attorney);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("unique") || message.includes("duplicate")) {
        console.log(`  ⚠ Skipping duplicate attorney: ${data.firstName} ${data.lastName}`);
      } else {
        throw err;
      }
    }
  }

  // Also add attorneys from assignments who aren't in the 03C breakdown
  for (const [nameKey, contact] of emailPhoneLookup) {
    if (!dbAttorneysMap.has(nameKey) && contact.email) {
      const [firstName, lastName] = nameKey.split("|");
      try {
        const [attorney] = await db
          .insert(schema.attorneys)
          .values({
            eventId: event.id,
            firstName,
            lastName,
            email: contact.email,
            phone: contact.phone || null,
            firm: "Unknown",
            status: "active",
          })
          .returning();
        dbAttorneysMap.set(nameKey, attorney);
      } catch {
        // Duplicate — skip
      }
    }
  }

  console.log(`  ✓ ${dbAttorneysMap.size} attorneys imported`);

  // ----------------------------------------------------------
  // 5. Create companies and interviewers from assignments
  // ----------------------------------------------------------
  console.log("\n🏢 Creating companies and interviewers...");

  // Collect unique companies and their interviewers from all sheets
  const companyInterviewerMap = new Map<string, Set<string>>();

  for (const sheetName of assignmentsWb.SheetNames) {
    const ws = assignmentsWb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      for (let j = 8; j < row.length; j += 5) {
        const company = row[j] as string;
        const interviewerStr = row[j + 1] as string;
        if (company) {
          if (!companyInterviewerMap.has(company)) {
            companyInterviewerMap.set(company, new Set());
          }
          if (interviewerStr) {
            const names = parseInterviewerString(interviewerStr);
            names.forEach((n) => companyInterviewerMap.get(company)!.add(n));
          }
        }
      }
    }
  }

  const dbCompaniesMap = new Map<string, typeof schema.companies.$inferSelect>();
  const dbInterviewersMap = new Map<string, typeof schema.companyInterviewers.$inferSelect>();

  for (const [companyName, interviewerNames] of companyInterviewerMap) {
    // Generate a simple invite code
    const inviteCode = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+$/, "")
      .substring(0, 30)
      + "-" + Math.random().toString(36).substring(2, 8);

    const [company] = await db
      .insert(schema.companies)
      .values({
        eventId: event.id,
        name: companyName,
        inviteCode,
        status: "invited",
      })
      .returning();

    dbCompaniesMap.set(companyName, company);

    // Create interviewers
    for (const iName of interviewerNames) {
      const [interviewer] = await db
        .insert(schema.companyInterviewers)
        .values({
          companyId: company.id,
          name: iName,
        })
        .returning();
      dbInterviewersMap.set(`${companyName}|${iName}`, interviewer);
    }

    console.log(
      `  ✓ ${companyName}: ${interviewerNames.size} interviewer(s)`
    );
  }

  // ----------------------------------------------------------
  // 6. Import assignments from "Selected for Interviews" sheet
  // ----------------------------------------------------------
  console.log("\n📋 Importing assignments...");

  const selectedWs = assignmentsWb.Sheets["Selected for Interviews"];
  const selectedRows = XLSX.utils.sheet_to_json(selectedWs, { header: 1 }) as unknown[][];

  let assignmentCount = 0;
  let skippedCount = 0;

  for (let i = 1; i < selectedRows.length; i++) {
    const row = selectedRows[i];
    if (!row || !row[0]) continue;

    const firstName = (row[0] as string).trim();
    const lastName = (row[1] as string).trim();
    const attorneyKey = `${firstName}|${lastName}`;
    const attorney = dbAttorneysMap.get(attorneyKey);

    if (!attorney) {
      console.log(`  ⚠ Attorney not found: ${firstName} ${lastName}`);
      skippedCount++;
      continue;
    }

    // Process each assignment (groups of 5 columns starting at index 6)
    for (let j = 6; j < row.length; j += 5) {
      const dateLabel = row[j] as string;
      const timeRange = row[j + 1] as string;
      const companyName = row[j + 2] as string;
      const interviewerStr = row[j + 3] as string;

      if (!dateLabel || !timeRange || !companyName) continue;

      try {
        const dateStr = dateLabelToDate(dateLabel);
        const { start } = parseTimeRange(timeRange);
        const slotKey = `${dateStr}|${start}`;
        const slot = timeSlotsMap.get(slotKey);

        if (!slot) {
          console.log(`  ⚠ Slot not found: ${slotKey} (from "${dateLabel}" "${timeRange}")`);
          skippedCount++;
          continue;
        }

        const company = dbCompaniesMap.get(companyName);
        if (!company) {
          console.log(`  ⚠ Company not found: ${companyName}`);
          skippedCount++;
          continue;
        }

        // Find the interviewer
        let interviewerId: string | undefined;
        if (interviewerStr) {
          const names = parseInterviewerString(interviewerStr);
          if (names.length > 0) {
            const interviewerKey = `${companyName}|${names[0]}`;
            const interviewer = dbInterviewersMap.get(interviewerKey);
            if (interviewer) {
              interviewerId = interviewer.id;
            }
          }
        }

        // Also create company_slot_selection if not exists
        try {
          await db
            .insert(schema.companySlotSelections)
            .values({
              companyId: company.id,
              timeSlotId: slot.id,
              interviewerId: interviewerId || null,
            })
            .onConflictDoNothing();
        } catch {
          // Ignore duplicates
        }

        // Create assignment
        await db.insert(schema.assignments).values({
          companyId: company.id,
          attorneyId: attorney.id,
          timeSlotId: slot.id,
          interviewerId: interviewerId || null,
          source: "admin",
          status: "confirmed",
        });

        assignmentCount++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("unique") || message.includes("duplicate")) {
          console.log(`  ⚠ Duplicate assignment skipped: ${firstName} ${lastName} at slot`);
          skippedCount++;
        } else {
          console.error(`  ❌ Error processing assignment for ${firstName} ${lastName}:`, message);
          skippedCount++;
        }
      }
    }
  }

  console.log(`  ✓ ${assignmentCount} assignments created (${skippedCount} skipped)`);

  // ----------------------------------------------------------
  // 7. Handle unavailability notes from Conflicts column
  // ----------------------------------------------------------
  console.log("\n🚫 Processing attorney unavailability...");

  let unavailCount = 0;

  for (const sheetName of ["Not Selected", "Cancelled"]) {
    const ws = assignmentsWb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;

      const firstName = (row[0] as string).trim();
      const lastName = (row[1] as string).trim();
      const conflicts = row[5] as string;
      const attorney = dbAttorneysMap.get(`${firstName}|${lastName}`);

      if (attorney && conflicts) {
        await db
          .update(schema.attorneys)
          .set({
            unavailableNote: conflicts,
          })
          .where(eq(schema.attorneys.id, attorney.id));
        unavailCount++;
      }

      // Mark "Not Selected" attorneys as not having assignments but still active
      // Mark "Cancelled" attorneys as withdrawn
      if (attorney && sheetName === "Cancelled") {
        await db
          .update(schema.attorneys)
          .set({ status: "withdrawn" })
          .where(eq(schema.attorneys.id, attorney.id));
      }
    }
  }

  console.log(`  ✓ ${unavailCount} unavailability notes added`);

  // ----------------------------------------------------------
  // Summary
  // ----------------------------------------------------------
  console.log("\n" + "=".repeat(50));
  console.log("🎉 Seed complete!");
  console.log(`   Event: ${event.name}`);
  console.log(`   Days: ${dayConfigs.length}`);
  console.log(`   Time Slots: ${timeSlotsMap.size}`);
  console.log(`   Attorneys: ${dbAttorneysMap.size}`);
  console.log(`   Companies: ${dbCompaniesMap.size}`);
  console.log(`   Assignments: ${assignmentCount}`);
  console.log("=".repeat(50));
}

// Run
seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
