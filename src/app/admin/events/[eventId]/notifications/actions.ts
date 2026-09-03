"use server";

import { revalidatePath } from "next/cache";
import { getRole } from "@/lib/auth";
import {
  authorizeAndSend,
  createNotificationBatch,
  deliverBatch,
  generatePreview,
} from "@/lib/notifications/service";
import { isAudienceKind } from "@/lib/notifications/types";
import { staffActorId } from "@/lib/staff-actor";

export type NotificationActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
};

async function requireAdmin(): Promise<void> {
  if ((await getRole()) !== "admin") throw new Error("Admin access required.");
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function eventPath(eventId: string): string {
  return `/admin/events/${eventId}/notifications`;
}

function refresh(eventId: string): void {
  revalidatePath(eventPath(eventId));
}

export async function createBatchAction(
  _previous: NotificationActionResult,
  formData: FormData
): Promise<NotificationActionResult> {
  await requireAdmin();
  const eventId = text(formData, "eventId");
  const audienceKind = text(formData, "audienceKind");
  const subject = text(formData, "subject");
  const bodyTemplate = text(formData, "bodyTemplate");
  if (!eventId || !isAudienceKind(audienceKind)) {
    return { ok: false, error: "Choose a valid event audience." };
  }
  if (!subject || subject.length > 300) {
    return { ok: false, error: "Enter a subject of 300 characters or fewer." };
  }
  if (!bodyTemplate || bodyTemplate.length > 20_000) {
    return { ok: false, error: "Enter a message of 20,000 characters or fewer." };
  }
  try {
    const actorId = await staffActorId();
    await createNotificationBatch({
      eventId,
      audienceKind,
      subject,
      bodyTemplate,
      createdBy: actorId,
    });
    refresh(eventId);
    return { ok: true, message: "Draft created. Generate its preview before sending." };
  } catch {
    return { ok: false, error: "The notification draft could not be created." };
  }
}

export async function previewBatchAction(
  _previous: NotificationActionResult,
  formData: FormData
): Promise<NotificationActionResult> {
  await requireAdmin();
  const eventId = text(formData, "eventId");
  const batchId = text(formData, "batchId");
  try {
    const result = await generatePreview({ eventId, batchId });
    refresh(eventId);
    return {
      ok: true,
      message: `Preview revision ${result.revision} saved with ${result.recipientCount} recipients (${result.blockedCount} blocked). No email was sent.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Preview generation failed.",
    };
  }
}

export async function authorizeBatchAction(
  _previous: NotificationActionResult,
  formData: FormData
): Promise<NotificationActionResult> {
  await requireAdmin();
  const eventId = text(formData, "eventId");
  const batchId = text(formData, "batchId");
  const previewRevision = Number(text(formData, "previewRevision"));
  if (!Number.isInteger(previewRevision) || previewRevision < 1) {
    return { ok: false, error: "Generate a preview before authorizing delivery." };
  }
  if (formData.get("confirmExactPreview") !== "yes") {
    return { ok: false, error: "Confirm the exact preview before authorizing delivery." };
  }
  try {
    const actorId = await staffActorId();
    const result = await authorizeAndSend({
      eventId,
      batchId,
      previewRevision,
      authorizedBy: actorId,
    });
    refresh(eventId);
    if (result.refused) return { ok: false, error: result.refused };
    return {
      ok: true,
      message: `Delivery run finished: ${result.sent} sent, ${result.failed} failed.`,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Delivery could not be authorized.",
    };
  }
}

export async function retryFailedAction(
  _previous: NotificationActionResult,
  formData: FormData
): Promise<NotificationActionResult> {
  await requireAdmin();
  const eventId = text(formData, "eventId");
  const batchId = text(formData, "batchId");
  try {
    const result = await deliverBatch({
      eventId,
      batchId,
      mode: "failed_only",
    });
    refresh(eventId);
    if (result.refused) return { ok: false, error: result.refused };
    return {
      ok: true,
      message: `Retry finished: ${result.sent} sent, ${result.failed} failed. Sent rows were not touched.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Retry failed.",
    };
  }
}
