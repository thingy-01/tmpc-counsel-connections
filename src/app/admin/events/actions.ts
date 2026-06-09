"use server";

import { db } from "@/lib/db";
import { assignments, companies, events } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRole } from "@/lib/auth";

export type ActionResult = { ok: boolean; error?: string };

async function requireAdmin(): Promise<void> {
  const role = await getRole();
  if (role !== "admin") throw new Error("Admin access required.");
}

function parseEventFields(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const location = (formData.get("location") as string)?.trim() || null;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const slotDuration = parseInt(formData.get("slotDuration") as string, 10);
  const status = (formData.get("status") as string) || "draft";

  if (!name) return { error: "Event name is required." };
  if (!startDate || !endDate) return { error: "Start and end dates are required." };
  if (endDate < startDate) return { error: "End date must be on or after the start date." };
  if (!Number.isFinite(slotDuration) || slotDuration < 5 || slotDuration > 120) {
    return { error: "Slot duration must be between 5 and 120 minutes." };
  }
  if (!["draft", "open", "closed"].includes(status)) {
    return { error: "Invalid status." };
  }

  return {
    fields: { name, description, location, startDate, endDate, slotDuration, status },
  };
}

export async function createEvent(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parseEventFields(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const [event] = await db.insert(events).values(parsed.fields!).returning();
  revalidatePath("/admin", "layout");
  redirect(`/admin/events/${event.id}/days`);
}

export async function updateEvent(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const parsed = parseEventFields(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  await db
    .update(events)
    .set({ ...parsed.fields!, updatedAt: new Date() })
    .where(eq(events.id, eventId));
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Delete the event and (via FK cascades) all of its days, slots, attorneys, companies, and assignments. */
export async function deleteEvent(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  await db.delete(events).where(eq(events.id, eventId));
  revalidatePath("/admin", "layout");
  redirect("/admin/events");
}

/** Clear all interview assignments for an event, keeping days/slots/attorneys/companies. */
export async function clearAssignments(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventId = formData.get("eventId") as string;
  const companyRows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.eventId, eventId));
  const ids = companyRows.map((c) => c.id);
  if (ids.length > 0) {
    await db.delete(assignments).where(inArray(assignments.companyId, ids));
  }
  revalidatePath("/admin", "layout");
}
