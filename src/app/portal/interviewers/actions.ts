"use server";

import { db } from "@/lib/db";
import { companyInterviewers, assignments } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCompanyId } from "@/lib/auth";

async function requireCompanyId(): Promise<string> {
  const id = await getCompanyId();
  if (!id) throw new Error("Not authenticated as a company.");
  return id;
}

/**
 * If a company has exactly one interviewer, assign that person to every slot
 * that does not already have an interviewer. No-op for 0 or 2+ interviewers.
 * Internal helper — not exported, so it is never exposed as a server action.
 */
async function applyDefaultInterviewer(companyId: string): Promise<void> {
  const list = await db
    .select({ id: companyInterviewers.id })
    .from(companyInterviewers)
    .where(eq(companyInterviewers.companyId, companyId));

  if (list.length !== 1) return;

  await db
    .update(assignments)
    .set({ interviewerId: list[0].id, updatedAt: new Date() })
    .where(
      and(eq(assignments.companyId, companyId), isNull(assignments.interviewerId))
    );
}

async function interviewerBelongsToCompany(
  interviewerId: string,
  companyId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: companyInterviewers.id })
    .from(companyInterviewers)
    .where(
      and(
        eq(companyInterviewers.id, interviewerId),
        eq(companyInterviewers.companyId, companyId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function addInterviewer(formData: FormData) {
  const companyId = await requireCompanyId();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  if (!name) throw new Error("Interviewer name is required.");

  await db.insert(companyInterviewers).values({ companyId, name, email, phone });
  await applyDefaultInterviewer(companyId);

  revalidatePath("/portal/interviewers");
  revalidatePath("/portal/schedule");
}

export async function updateInterviewer(formData: FormData) {
  const companyId = await requireCompanyId();
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  if (!name) throw new Error("Interviewer name is required.");

  await db
    .update(companyInterviewers)
    .set({ name, email, phone })
    .where(
      and(
        eq(companyInterviewers.id, id),
        eq(companyInterviewers.companyId, companyId)
      )
    );

  revalidatePath("/portal/interviewers");
  revalidatePath("/portal/schedule");
}

export async function deleteInterviewer(formData: FormData) {
  const companyId = await requireCompanyId();
  const id = formData.get("id") as string;

  // FK onDelete: set null clears this interviewer from any assignments.
  await db
    .delete(companyInterviewers)
    .where(
      and(
        eq(companyInterviewers.id, id),
        eq(companyInterviewers.companyId, companyId)
      )
    );
  await applyDefaultInterviewer(companyId);

  revalidatePath("/portal/interviewers");
  revalidatePath("/portal/schedule");
}

/** Assign (or clear) the interviewer for a single interview/assignment. */
export async function assignInterviewer(formData: FormData) {
  const companyId = await requireCompanyId();
  const assignmentId = formData.get("assignmentId") as string;
  const raw = (formData.get("interviewerId") as string) ?? "";
  const interviewerId = raw === "" ? null : raw;

  if (interviewerId && !(await interviewerBelongsToCompany(interviewerId, companyId))) {
    throw new Error("That interviewer does not belong to your company.");
  }

  await db
    .update(assignments)
    .set({ interviewerId, updatedAt: new Date() })
    .where(
      and(eq(assignments.id, assignmentId), eq(assignments.companyId, companyId))
    );

  revalidatePath("/portal/schedule");
}

/** Bulk-assign (or clear) one interviewer across all of the company's slots. */
export async function assignAllToInterviewer(formData: FormData) {
  const companyId = await requireCompanyId();
  const raw = (formData.get("interviewerId") as string) ?? "";
  const interviewerId = raw === "" ? null : raw;

  if (interviewerId && !(await interviewerBelongsToCompany(interviewerId, companyId))) {
    throw new Error("That interviewer does not belong to your company.");
  }

  await db
    .update(assignments)
    .set({ interviewerId, updatedAt: new Date() })
    .where(eq(assignments.companyId, companyId));

  revalidatePath("/portal/schedule");
}
