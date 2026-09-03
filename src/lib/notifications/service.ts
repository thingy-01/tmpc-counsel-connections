import { sql, eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  notificationBatches,
  notificationRecipients,
} from "@/lib/db/schema";
import {
  EmailDeliveryError,
  type EmailMessage,
  type EmailSendResult,
} from "@/lib/email/types";
import { buildPreview, hashValue, previewHash } from "./preview";
import { loadEventAudience } from "./data";
import {
  isAudienceKind,
  type AudienceKind,
  type StoredAudience,
} from "./types";

export type NotificationTransport = {
  send(message: EmailMessage): Promise<EmailSendResult>;
};

type RowResult<T> = T[] | { rows: T[] };

type ClaimedRecipient = {
  id: string;
  email: string;
  rendered_subject: string;
  rendered_body: string;
  provider_idempotency_key: string;
};

const EMAIL_PROVIDER_TIMEOUT_MS = 20_000;
const SEND_CLAIM_LEASE_MS = 60_000;

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

function storedAudience(value: unknown): StoredAudience {
  if (!value || typeof value !== "object") {
    throw new Error("This notification batch has invalid audience criteria.");
  }
  const candidate = value as { kind?: unknown; previewSourceHash?: unknown };
  if (typeof candidate.kind !== "string" || !isAudienceKind(candidate.kind)) {
    throw new Error("This notification batch has invalid audience criteria.");
  }
  return {
    kind: candidate.kind,
    previewSourceHash:
      typeof candidate.previewSourceHash === "string"
        ? candidate.previewSourceHash
        : undefined,
  };
}

function configuredPortalUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("NEXT_PUBLIC_APP_URL is not set. Notifications are disabled.");
}

function previewSourceHash(
  audienceSourceHash: string,
  subject: string,
  bodyTemplate: string
): string {
  return hashValue({ audienceSourceHash, subject, bodyTemplate });
}

export async function createNotificationBatch(input: {
  eventId: string;
  subject: string;
  bodyTemplate: string;
  audienceKind: AudienceKind;
  createdBy: string;
}): Promise<string> {
  const [created] = await db
    .insert(notificationBatches)
    .values({
      eventId: input.eventId,
      subject: input.subject,
      bodyTemplate: input.bodyTemplate,
      audience: { kind: input.audienceKind },
      createdBy: input.createdBy,
      status: "draft",
    })
    .returning({ id: notificationBatches.id });
  if (!created) throw new Error("The notification draft could not be created.");
  return created.id;
}

export async function generatePreview(input: {
  eventId: string;
  batchId: string;
}): Promise<{ revision: number; recipientCount: number; blockedCount: number }> {
  const batches = await db
    .select()
    .from(notificationBatches)
    .where(
      and(
        eq(notificationBatches.id, input.batchId),
        eq(notificationBatches.eventId, input.eventId)
      )
    )
    .limit(1);
  const batch = batches[0];
  if (!batch) throw new Error("Notification draft not found.");
  if (["sending", "partial", "completed"].includes(batch.status)) {
    throw new Error("A batch that has started delivery cannot be re-previewed.");
  }

  const audience = storedAudience(batch.audience);
  const audienceData = await loadEventAudience(input.eventId, audience);
  const currentSourceHash = previewSourceHash(
    audienceData.sourceHash,
    batch.subject,
    batch.bodyTemplate
  );
  const preview = buildPreview({
    attorneys: audienceData.attorneys,
    eventName: audienceData.event.name,
    portalUrl: `${configuredPortalUrl()}/attorney/login`,
    subjectTemplate: batch.subject,
    bodyTemplate: batch.bodyTemplate,
  });
  const wholePreviewHash = previewHash(preview.recipients);
  const payload = preview.recipients.map((recipient) => ({
    attorney_id: recipient.attorneyId,
    email: recipient.email,
    rendered_subject: recipient.renderedSubject,
    rendered_body: recipient.renderedBody,
    content_hash: recipient.contentHash,
    provider_idempotency_key: recipient.providerIdempotencyKey,
    status: recipient.status,
  }));

  // One statement makes replacement of the immutable recipient snapshot and
  // the revision bump atomic on both local Postgres and Neon HTTP.
  const result = (await db.execute(sql`
    WITH target AS (
      SELECT id, preview_revision
      FROM notification_batches
      WHERE id = ${input.batchId}::uuid
        AND event_id = ${input.eventId}::uuid
        AND status IN ('draft', 'previewed', 'stale', 'authorized')
      FOR UPDATE
    ), removed AS (
      DELETE FROM notification_recipients
      WHERE batch_id IN (SELECT id FROM target)
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS retained(
            attorney_id uuid
          )
          WHERE retained.attorney_id = notification_recipients.attorney_id
        )
      RETURNING id
    ), updated AS (
      UPDATE notification_batches AS batch
      SET preview_revision = target.preview_revision + 1,
          preview_hash = ${wholePreviewHash},
          previewed_at = now(),
          audience = jsonb_set(
            batch.audience,
            '{previewSourceHash}',
            to_jsonb(${currentSourceHash}::text),
            true
          ),
          status = 'previewed',
          authorized_by = NULL,
          authorized_at = NULL,
          completed_at = NULL
      FROM target
      WHERE batch.id = target.id
      RETURNING batch.id, batch.preview_revision
    ), inserted AS (
      INSERT INTO notification_recipients (
        batch_id, attorney_id, email, preview_revision, rendered_subject,
        rendered_body, content_hash, provider_idempotency_key, status
      )
      SELECT
        updated.id, recipient.attorney_id, recipient.email,
        updated.preview_revision, recipient.rendered_subject,
        recipient.rendered_body, recipient.content_hash,
        recipient.provider_idempotency_key, recipient.status
      FROM updated
      CROSS JOIN jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS recipient(
        attorney_id uuid,
        email text,
        rendered_subject text,
        rendered_body text,
        content_hash text,
        provider_idempotency_key text,
        status text
      )
      ON CONFLICT (batch_id, attorney_id) DO UPDATE SET
        email = EXCLUDED.email,
        preview_revision = EXCLUDED.preview_revision,
        rendered_subject = EXCLUDED.rendered_subject,
        rendered_body = EXCLUDED.rendered_body,
        content_hash = EXCLUDED.content_hash,
        provider_idempotency_key = EXCLUDED.provider_idempotency_key,
        status = EXCLUDED.status,
        attempts = 0,
        send_claimed_at = NULL,
        last_error = NULL,
        provider_message_id = NULL,
        sent_at = NULL,
        created_at = now()
      RETURNING id
    )
    SELECT updated.preview_revision,
           (SELECT count(*)::int FROM inserted) AS recipient_count
    FROM updated
  `)) as unknown as RowResult<{
    preview_revision: number;
    recipient_count: number;
  }>;
  const updated = resultRows<{
    preview_revision: number;
    recipient_count: number;
  }>(result)[0];
  if (!updated) {
    throw new Error("The draft changed while its preview was being generated.");
  }
  return {
    revision: updated.preview_revision,
    recipientCount: updated.recipient_count,
    blockedCount: preview.recipients.filter((recipient) =>
      recipient.status.startsWith("blocked_")
    ).length,
  };
}

async function freshBatch(batchId: string, eventId: string) {
  const batches = await db
    .select()
    .from(notificationBatches)
    .where(
      and(
        eq(notificationBatches.id, batchId),
        eq(notificationBatches.eventId, eventId)
      )
    )
    .limit(1);
  const batch = batches[0];
  if (!batch) throw new Error("Notification batch not found.");
  const audience = storedAudience(batch.audience);
  const current = await loadEventAudience(eventId, audience);
  const currentHash = previewSourceHash(
    current.sourceHash,
    batch.subject,
    batch.bodyTemplate
  );
  return { batch, audience, isFresh: currentHash === audience.previewSourceHash };
}

async function markStale(batchId: string, revision: number): Promise<void> {
  await db
    .update(notificationBatches)
    .set({ status: "stale", authorizedBy: null, authorizedAt: null })
    .where(
      and(
        eq(notificationBatches.id, batchId),
        eq(notificationBatches.previewRevision, revision)
      )
    );
}

export async function authorizeAndSend(input: {
  eventId: string;
  batchId: string;
  previewRevision: number;
  authorizedBy: string;
  transport?: NotificationTransport;
}): Promise<{ sent: number; failed: number; refused?: string }> {
  if (!input.transport) await assertConfiguredTransport();
  const freshness = await freshBatch(input.batchId, input.eventId);
  if (
    freshness.batch.previewRevision !== input.previewRevision ||
    freshness.batch.status !== "previewed"
  ) {
    return { sent: 0, failed: 0, refused: "That preview revision is no longer current." };
  }
  if (!freshness.isFresh) {
    await markStale(input.batchId, input.previewRevision);
    return {
      sent: 0,
      failed: 0,
      refused: "The event, schedule, or audience changed. Generate a fresh preview.",
    };
  }

  const authorized = await db
    .update(notificationBatches)
    .set({
      status: "authorized",
      authorizedBy: input.authorizedBy,
      authorizedAt: new Date(),
    })
    .where(
      and(
        eq(notificationBatches.id, input.batchId),
        eq(notificationBatches.eventId, input.eventId),
        eq(notificationBatches.status, "previewed"),
        eq(notificationBatches.previewRevision, input.previewRevision)
      )
    )
    .returning({ id: notificationBatches.id });
  if (authorized.length !== 1) {
    return { sent: 0, failed: 0, refused: "The preview changed before authorization." };
  }
  return deliverBatch({
    eventId: input.eventId,
    batchId: input.batchId,
    mode: "all",
    transport: input.transport,
  });
}

export async function deliverBatch(input: {
  eventId: string;
  batchId: string;
  mode: "all" | "failed_only";
  transport?: NotificationTransport;
  /** Test-only override. Production callers use the bounded default. */
  timeoutMs?: number;
}): Promise<{ sent: number; failed: number; refused?: string }> {
  if (!input.transport) await assertConfiguredTransport();
  const freshness = await freshBatch(input.batchId, input.eventId);
  if (!freshness.batch.authorizedBy || !freshness.batch.authorizedAt) {
    return { sent: 0, failed: 0, refused: "This batch has not been authorized." };
  }
  if (!freshness.isFresh) {
    await markStale(input.batchId, freshness.batch.previewRevision);
    return {
      sent: 0,
      failed: 0,
      refused: "The event, schedule, or audience changed. Generate a fresh preview.",
    };
  }
  if (!["authorized", "sending", "partial"].includes(freshness.batch.status)) {
    return { sent: 0, failed: 0, refused: "This batch cannot enter sending." };
  }
  await db
    .update(notificationBatches)
    .set({ status: "sending" })
    .where(
      and(
        eq(notificationBatches.id, input.batchId),
        eq(notificationBatches.eventId, input.eventId)
      )
    );

  const candidates = await db
    .select({ id: notificationRecipients.id })
    .from(notificationRecipients)
    .where(eq(notificationRecipients.batchId, input.batchId))
    .orderBy(asc(notificationRecipients.createdAt), asc(notificationRecipients.id));
  const transport: NotificationTransport = input.transport ?? {
    send: async (message) => (await import("@/lib/email")).sendEmail(message),
  };
  // Resolve all configuration before a recipient is claimed and its attempt
  // count advances. Configuration errors are not delivery failures.
  const sender = configuredSender();
  let nextIndex = 0;
  let sent = 0;
  let failed = 0;
  let systemFailure: string | null = null;

  async function worker() {
    while (nextIndex < candidates.length) {
      if (systemFailure) return;
      const candidate = candidates[nextIndex++];
      const claimedAt = new Date();
      const claimedResult = await db.execute(sql`
        UPDATE notification_recipients
           SET status = 'sending',
               attempts = attempts + CASE WHEN status = 'sending' THEN 0 ELSE 1 END,
               send_claimed_at = ${claimedAt}
         WHERE id = ${candidate.id}::uuid
           AND (
             (status = 'pending' AND attempts < 3)
             OR (
               ${input.mode === "failed_only"}
               AND status = 'failed'
               AND attempts < 3
             )
             OR (
               ${input.mode === "failed_only"}
               AND status = 'sending'
               AND (
                 send_claimed_at IS NULL
                 OR send_claimed_at < now() - (${SEND_CLAIM_LEASE_MS} * interval '1 millisecond')
               )
             )
           )
        RETURNING *
      `);
      const claimed = resultRows<ClaimedRecipient>(claimedResult);
      if (claimed.length !== 1) continue;
      const recipient = claimed[0];
      try {
        const result = await sendWithTimeout(
          transport,
          {
            from: sender,
            to: recipient.email,
            subject: recipient.rendered_subject,
            text: recipient.rendered_body,
            html: textAsHtml(recipient.rendered_body),
            idempotencyKey: recipient.provider_idempotency_key,
          },
          input.timeoutMs ?? EMAIL_PROVIDER_TIMEOUT_MS
        );
        const recorded = await db
          .update(notificationRecipients)
          .set({
            status: "sent",
            providerMessageId: result.messageId,
            lastError: null,
            sentAt: new Date(),
            sendClaimedAt: null,
          })
          .where(
            and(
              eq(notificationRecipients.id, recipient.id),
              eq(notificationRecipients.status, "sending"),
              eq(notificationRecipients.sendClaimedAt, claimedAt)
            )
          )
          .returning({ id: notificationRecipients.id });
        if (recorded.length === 1) sent += 1;
      } catch (error) {
        const systemic =
          error instanceof EmailDeliveryError && error.scope === "system";
        const permanent =
          error instanceof EmailDeliveryError &&
          error.scope === "recipient" &&
          !error.retryable;
        if (systemic) {
          systemFailure =
            "The email provider rejected or could not process this delivery configuration. Correct the provider or sender configuration, then retry unfinished recipients.";
        }
        const recorded = await db
          .update(notificationRecipients)
          .set({
            status: permanent ? "failed_permanent" : "failed",
            ...(systemic
              ? { attempts: sql`greatest(${notificationRecipients.attempts} - 1, 0)` }
              : {}),
            lastError: safeDeliveryError(error),
            sendClaimedAt: null,
          })
          .where(
            and(
              eq(notificationRecipients.id, recipient.id),
              eq(notificationRecipients.status, "sending"),
              eq(notificationRecipients.sendClaimedAt, claimedAt)
            )
          )
          .returning({ id: notificationRecipients.id });
        if (recorded.length === 1) failed += 1;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(5, candidates.length) }, () => worker())
  );

  const unfinishedResult = await db.execute(sql`
    SELECT count(*)::int AS count
    FROM notification_recipients
    WHERE batch_id = ${input.batchId}::uuid
      AND (
        status IN ('pending', 'sending')
        OR (status = 'failed' AND attempts < 3)
      )
  `);
  const unfinished = resultRows<{ count: number }>(unfinishedResult)[0]?.count ?? 0;
  await db
    .update(notificationBatches)
    .set({
      status: unfinished > 0 ? "partial" : "completed",
      completedAt: unfinished > 0 ? null : new Date(),
    })
    .where(eq(notificationBatches.id, input.batchId));
  return { sent, failed, ...(systemFailure ? { refused: systemFailure } : {}) };
}

function configuredSender(): string {
  const selected = process.env.ATTORNEY_EMAIL_TRANSPORT?.trim() || "resend";
  if (selected === "capture") {
    return process.env.ATTORNEY_EMAIL_FROM?.trim() || "notifications@localhost";
  }
  const sender = process.env.ATTORNEY_EMAIL_FROM?.trim();
  if (!sender) throw new Error("ATTORNEY_EMAIL_FROM is not set. Notifications are disabled.");
  return sender;
}

async function sendWithTimeout(
  transport: NotificationTransport,
  message: EmailMessage,
  timeoutMs: number
): Promise<EmailSendResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      transport.send(message),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new EmailDeliveryError(
            "Email provider response timed out.",
            true,
            "recipient"
          )),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function assertConfiguredTransport(): Promise<void> {
  (await import("@/lib/email")).assertAttorneyEmailConfigured();
}

function textAsHtml(text: string): string {
  const escaped = text.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
  return `<p>${escaped.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
}

function safeDeliveryError(error: unknown): string {
  if (error instanceof EmailDeliveryError) return error.message.slice(0, 500);
  return "The email provider did not confirm delivery. This recipient may be retried safely.";
}
