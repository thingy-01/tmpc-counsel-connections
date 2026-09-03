import assert from "node:assert/strict";
import { requireLocalTestDatabase } from "../../../scripts/test-database-guard";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { mock } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignments,
  attorneys,
  companies,
  companyInterviewers,
  eventDays,
  events,
  notificationBatches,
  notificationRecipients,
  timeSlots,
} from "@/lib/db/schema";
import { EmailDeliveryError, type EmailMessage } from "@/lib/email/types";
import {
  authorizeAndSend,
  createNotificationBatch,
  deliverBatch,
  generatePreview,
  type NotificationTransport,
} from "./service";

mock.module("server-only", { defaultExport: {} });

const createdEventIds: string[] = [];

type Scenario = {
  eventId: string;
  companyId: string;
  attorneyIds: string[];
  assignmentIds: string[];
};

async function scenario(options?: { ambiguous?: boolean; recipientCount?: number }): Promise<Scenario> {
  const eventId = randomUUID();
  createdEventIds.push(eventId);
  const dayId = randomUUID();
  const companyId = randomUUID();
  const interviewerId = randomUUID();
  const count = options?.recipientCount ?? 1;
  await db.insert(events).values({
    id: eventId,
    name: `Synthetic Event ${eventId.slice(0, 8)}`,
    startDate: "2026-10-06",
    endDate: "2026-10-06",
    status: "open",
  });
  await db.insert(eventDays).values({
    id: dayId,
    eventId,
    date: "2026-10-06",
    label: "Tuesday, October 6",
    format: "virtual",
    startTime: "16:00:00",
    endTime: "18:00:00",
  });
  await db.insert(companies).values({
    id: companyId,
    eventId,
    name: `Synthetic Company ${eventId.slice(0, 8)}`,
    preferredPlatform: "zoom",
  });
  await db.insert(companyInterviewers).values({
    id: interviewerId,
    companyId,
    name: "Jordan Synthetic",
  });

  const attorneyIds: string[] = [];
  const assignmentIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const slotId = randomUUID();
    const attorneyId = randomUUID();
    const assignmentId = randomUUID();
    attorneyIds.push(attorneyId);
    assignmentIds.push(assignmentId);
    const startMinute = 16 * 60 + index * 15;
    const endMinute = startMinute + 15;
    const startTime = `${String(Math.floor(startMinute / 60)).padStart(2, "0")}:${String(startMinute % 60).padStart(2, "0")}:00`;
    const endTime = `${String(Math.floor(endMinute / 60)).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}:00`;
    await db.insert(timeSlots).values({
      id: slotId,
      eventDayId: dayId,
      startTime,
      endTime,
      sortOrder: index,
    });
    await db.insert(attorneys).values({
      id: attorneyId,
      eventId,
      firstName: index === 0 ? "Avery" : "Blake",
      lastName: "Synthetic",
      email:
        options?.ambiguous && index === 1
          ? "AVERY.SYNTHETIC@EXAMPLE.TEST"
          : index === 0
            ? "avery.synthetic@example.test"
            : `blake${index}.synthetic@example.test`,
      firm: "Synthetic Law",
      status: "active",
    });
    await db.insert(assignments).values({
      id: assignmentId,
      companyId,
      attorneyId,
      timeSlotId: slotId,
      interviewerId,
      status: "confirmed",
      notes: "PRIVATE_ASSIGNMENT_NOTE_SENTINEL",
    });
  }
  return { eventId, companyId, attorneyIds, assignmentIds };
}

async function draft(eventId: string): Promise<string> {
  return createNotificationBatch({
    eventId,
    subject: "Stored subject for {{first_name}}",
    bodyTemplate: "Hello {{first_name}}\n\n{{schedule}}\n\n{{portal_url}}",
    audienceKind: "active_with_confirmed_assignments",
    createdBy: "integration-admin",
  });
}

async function rows(batchId: string) {
  return db
    .select()
    .from(notificationRecipients)
    .where(eq(notificationRecipients.batchId, batchId));
}

function successTransport(messages: EmailMessage[]): NotificationTransport {
  return {
    async send(message) {
      messages.push(message);
      return { messageId: `synthetic-provider-${messages.length}` };
    },
  };
}

async function testStoredPreviewAndStaleness(): Promise<void> {
  const item = await scenario();
  const batchId = await draft(item.eventId);
  const firstPreview = await generatePreview({ eventId: item.eventId, batchId });
  assert.equal(firstPreview.revision, 1);
  const stored = (await rows(batchId))[0];
  assert.ok(stored.renderedBody.includes("Synthetic Company"));
  assert.ok(stored.renderedBody.includes("Interviewer: Jordan Synthetic"));
  assert.ok(stored.renderedBody.includes("Platform: Zoom"));
  assert.equal(stored.renderedBody.includes("PRIVATE_ASSIGNMENT_NOTE_SENTINEL"), false);

  await db
    .update(companies)
    .set({ preferredPlatform: "teams" })
    .where(eq(companies.id, item.companyId));
  const messages: EmailMessage[] = [];
  const stale = await authorizeAndSend({
    eventId: item.eventId,
    batchId,
    previewRevision: 1,
    authorizedBy: "integration-admin",
    transport: successTransport(messages),
  });
  assert.match(stale.refused ?? "", /fresh preview/i);
  assert.equal(messages.length, 0);
  assert.equal((await rows(batchId))[0].renderedBody, stored.renderedBody);
  const [staleBatch] = await db
    .select()
    .from(notificationBatches)
    .where(eq(notificationBatches.id, batchId));
  assert.equal(staleBatch.status, "stale");

  const secondPreview = await generatePreview({ eventId: item.eventId, batchId });
  assert.equal(secondPreview.revision, 2);
  const oldAuthorization = await authorizeAndSend({
    eventId: item.eventId,
    batchId,
    previewRevision: 1,
    authorizedBy: "integration-admin",
    transport: successTransport(messages),
  });
  assert.match(oldAuthorization.refused ?? "", /revision/i);
  assert.equal(messages.length, 0);

  const currentStored = (await rows(batchId))[0];
  const sent = await authorizeAndSend({
    eventId: item.eventId,
    batchId,
    previewRevision: 2,
    authorizedBy: "integration-admin",
    transport: successTransport(messages),
  });
  assert.equal(sent.sent, 1, JSON.stringify(sent));
  assert.equal(messages[0].subject, currentStored.renderedSubject);
  assert.equal(messages[0].text, currentStored.renderedBody);
  assert.equal(messages[0].idempotencyKey, currentStored.providerIdempotencyKey);
}

async function testAmbiguousEmails(): Promise<void> {
  const item = await scenario({ ambiguous: true, recipientCount: 2 });
  const batchId = await draft(item.eventId);
  await generatePreview({ eventId: item.eventId, batchId });
  const recipients = await rows(batchId);
  assert.deepEqual(
    recipients.map((recipient) => recipient.status).sort(),
    ["blocked_ambiguous", "blocked_ambiguous"]
  );
  const messages: EmailMessage[] = [];
  const result = await authorizeAndSend({
    eventId: item.eventId,
    batchId,
    previewRevision: 1,
    authorizedBy: "integration-admin",
    transport: successTransport(messages),
  });
  assert.equal(result.sent, 0);
  assert.equal(messages.length, 0);
}

async function testRetries(): Promise<void> {
  const item = await scenario();
  const batchId = await draft(item.eventId);
  await generatePreview({ eventId: item.eventId, batchId });
  const keys: Array<string | undefined> = [];
  let fail = true;
  const transport: NotificationTransport = {
    async send(message) {
      keys.push(message.idempotencyKey);
      if (fail) throw new EmailDeliveryError("Synthetic timeout.", true);
      return { messageId: "synthetic-retry-success" };
    },
  };
  const first = await authorizeAndSend({
    eventId: item.eventId,
    batchId,
    previewRevision: 1,
    authorizedBy: "integration-admin",
    transport,
  });
  assert.equal(first.failed, 1);
  fail = false;
  const retry = await deliverBatch({
    eventId: item.eventId,
    batchId,
    mode: "failed_only",
    transport,
  });
  assert.equal(retry.sent, 1);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  const [sentRow] = await rows(batchId);
  assert.equal(sentRow.status, "sent");
  assert.equal(sentRow.attempts, 2);
  const afterSent = await deliverBatch({
    eventId: item.eventId,
    batchId,
    mode: "failed_only",
    transport,
  });
  assert.equal(afterSent.sent, 0);
  assert.equal(keys.length, 2);

  const exhaustedItem = await scenario();
  const exhaustedBatch = await draft(exhaustedItem.eventId);
  await generatePreview({ eventId: exhaustedItem.eventId, batchId: exhaustedBatch });
  let calls = 0;
  const alwaysRetryable: NotificationTransport = {
    async send() {
      calls += 1;
      throw new EmailDeliveryError("Synthetic timeout.", true);
    },
  };
  await authorizeAndSend({
    eventId: exhaustedItem.eventId,
    batchId: exhaustedBatch,
    previewRevision: 1,
    authorizedBy: "integration-admin",
    transport: alwaysRetryable,
  });
  await deliverBatch({ eventId: exhaustedItem.eventId, batchId: exhaustedBatch, mode: "failed_only", transport: alwaysRetryable });
  await deliverBatch({ eventId: exhaustedItem.eventId, batchId: exhaustedBatch, mode: "failed_only", transport: alwaysRetryable });
  await deliverBatch({ eventId: exhaustedItem.eventId, batchId: exhaustedBatch, mode: "failed_only", transport: alwaysRetryable });
  assert.equal(calls, 3);
  assert.equal((await rows(exhaustedBatch))[0].attempts, 3);

  const permanentItem = await scenario();
  const permanentBatch = await draft(permanentItem.eventId);
  await generatePreview({ eventId: permanentItem.eventId, batchId: permanentBatch });
  let permanentCalls = 0;
  const permanent: NotificationTransport = {
    async send() {
      permanentCalls += 1;
      throw new EmailDeliveryError("Synthetic invalid recipient.", false);
    },
  };
  await authorizeAndSend({
    eventId: permanentItem.eventId,
    batchId: permanentBatch,
    previewRevision: 1,
    authorizedBy: "integration-admin",
    transport: permanent,
  });
  await deliverBatch({ eventId: permanentItem.eventId, batchId: permanentBatch, mode: "failed_only", transport: permanent });
  assert.equal(permanentCalls, 1);
  assert.equal((await rows(permanentBatch))[0].status, "failed_permanent");
}

async function testInterruptedDeliveryLease(): Promise<void> {
  const item = await scenario();
  const batchId = await draft(item.eventId);
  await generatePreview({ eventId: item.eventId, batchId });
  await db
    .update(notificationBatches)
    .set({ status: "authorized", authorizedBy: "integration-admin", authorizedAt: new Date() })
    .where(eq(notificationBatches.id, batchId));
  const before = (await rows(batchId))[0];
  await db
    .update(notificationRecipients)
    .set({ status: "sending", attempts: 1, sendClaimedAt: new Date() })
    .where(eq(notificationRecipients.id, before.id));

  const freshMessages: EmailMessage[] = [];
  const fresh = await deliverBatch({
    eventId: item.eventId,
    batchId,
    mode: "failed_only",
    transport: successTransport(freshMessages),
  });
  assert.equal(fresh.sent, 0);
  assert.equal(freshMessages.length, 0);
  assert.equal((await rows(batchId))[0].status, "sending");

  await db
    .update(notificationRecipients)
    .set({ sendClaimedAt: new Date(Date.now() - 120_000) })
    .where(eq(notificationRecipients.id, before.id));
  const recoveredMessages: EmailMessage[] = [];
  const recovered = await deliverBatch({
    eventId: item.eventId,
    batchId,
    mode: "failed_only",
    transport: successTransport(recoveredMessages),
  });
  assert.equal(recovered.sent, 1);
  assert.equal(recoveredMessages[0].idempotencyKey, before.providerIdempotencyKey);
  const after = (await rows(batchId))[0];
  assert.equal(after.status, "sent");
  assert.equal(after.attempts, 1);
  assert.equal(after.sendClaimedAt, null);

  const legacyItem = await scenario();
  const legacyBatchId = await draft(legacyItem.eventId);
  await generatePreview({ eventId: legacyItem.eventId, batchId: legacyBatchId });
  await db
    .update(notificationBatches)
    .set({ status: "authorized", authorizedBy: "integration-admin", authorizedAt: new Date() })
    .where(eq(notificationBatches.id, legacyBatchId));
  const legacyBefore = (await rows(legacyBatchId))[0];
  await db
    .update(notificationRecipients)
    .set({ status: "sending", attempts: 2, sendClaimedAt: null })
    .where(eq(notificationRecipients.id, legacyBefore.id));
  const legacyMessages: EmailMessage[] = [];
  const legacyRecovered = await deliverBatch({
    eventId: legacyItem.eventId,
    batchId: legacyBatchId,
    mode: "failed_only",
    transport: successTransport(legacyMessages),
  });
  assert.equal(legacyRecovered.sent, 1);
  assert.equal(legacyMessages[0].idempotencyKey, legacyBefore.providerIdempotencyKey);
  const legacyAfter = (await rows(legacyBatchId))[0];
  assert.equal(legacyAfter.status, "sent");
  assert.equal(legacyAfter.attempts, 2);
}

async function testRecipientTimeoutIsolation(): Promise<void> {
  const item = await scenario({ recipientCount: 3 });
  const batchId = await draft(item.eventId);
  await generatePreview({ eventId: item.eventId, batchId });
  await db
    .update(notificationBatches)
    .set({ status: "authorized", authorizedBy: "integration-admin", authorizedAt: new Date() })
    .where(eq(notificationBatches.id, batchId));
  const before = await rows(batchId);
  const timedOut = before.find((recipient) => recipient.email === "avery.synthetic@example.test");
  assert.ok(timedOut);
  const delivered: EmailMessage[] = [];
  const transport: NotificationTransport = {
    async send(message) {
      if (message.to === timedOut.email) return new Promise<never>(() => undefined);
      delivered.push(message);
      return { messageId: `synthetic-${message.to}` };
    },
  };
  const first = await deliverBatch({
    eventId: item.eventId,
    batchId,
    mode: "all",
    transport,
    timeoutMs: 20,
  });
  assert.equal(first.refused, undefined);
  assert.equal(first.sent, 2);
  assert.equal(first.failed, 1);
  assert.equal(delivered.length, 2);
  const afterTimeout = await rows(batchId);
  const failed = afterTimeout.find((recipient) => recipient.id === timedOut.id);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.attempts, 1);
  assert.match(failed?.lastError ?? "", /timed out/i);
  assert.equal(afterTimeout.filter((recipient) => recipient.status === "sent").length, 2);

  const retried: EmailMessage[] = [];
  const retry = await deliverBatch({
    eventId: item.eventId,
    batchId,
    mode: "failed_only",
    transport: successTransport(retried),
    timeoutMs: 20,
  });
  assert.equal(retry.sent, 1);
  assert.equal(retried[0].idempotencyKey, timedOut.providerIdempotencyKey);
  const afterRetry = (await rows(batchId)).find((recipient) => recipient.id === timedOut.id);
  assert.equal(afterRetry?.status, "sent");
  assert.equal(afterRetry?.attempts, 2);
}

async function testSystemFailureStopsAndResumesBatch(): Promise<void> {
  const item = await scenario({ recipientCount: 7 });
  const batchId = await draft(item.eventId);
  await generatePreview({ eventId: item.eventId, batchId });
  const firstKeys = new Map<string, string | undefined>();
  let calls = 0;
  const rejectedConfiguration: NotificationTransport = {
    async send(message) {
      calls += 1;
      firstKeys.set(message.to, message.idempotencyKey);
      throw new EmailDeliveryError("Synthetic sender rejection.", false, "system");
    },
  };
  const first = await authorizeAndSend({
    eventId: item.eventId,
    batchId,
    previewRevision: 1,
    authorizedBy: "integration-admin",
    transport: rejectedConfiguration,
  });
  assert.match(first.refused ?? "", /provider|configuration/i);
  assert.ok(calls > 0 && calls < 7, `expected bounded claims, received ${calls}`);
  const interrupted = await rows(batchId);
  assert.ok(interrupted.some((recipient) => recipient.status === "pending"));
  assert.ok(interrupted.some((recipient) => recipient.status === "failed"));
  assert.ok(
    interrupted
      .filter((recipient) => recipient.status === "failed")
      .every((recipient) => recipient.attempts === 0)
  );
  assert.equal(interrupted.some((recipient) => recipient.status === "failed_permanent"), false);
  const [partialBatch] = await db
    .select()
    .from(notificationBatches)
    .where(eq(notificationBatches.id, batchId));
  assert.equal(partialBatch.status, "partial");

  const retryMessages: EmailMessage[] = [];
  const retry = await deliverBatch({
    eventId: item.eventId,
    batchId,
    mode: "failed_only",
    transport: successTransport(retryMessages),
  });
  assert.equal(retry.sent, 7);
  for (const message of retryMessages) {
    const priorKey = firstKeys.get(message.to);
    if (priorKey) assert.equal(message.idempotencyKey, priorKey);
  }
  assert.ok((await rows(batchId)).every((recipient) => recipient.status === "sent"));
}

async function testConcurrencyAndAuthorization(): Promise<void> {
  const unauthorizedItem = await scenario();
  const unauthorizedBatch = await draft(unauthorizedItem.eventId);
  await generatePreview({ eventId: unauthorizedItem.eventId, batchId: unauthorizedBatch });
  const refused = await deliverBatch({
    eventId: unauthorizedItem.eventId,
    batchId: unauthorizedBatch,
    mode: "all",
    transport: successTransport([]),
  });
  assert.match(refused.refused ?? "", /not been authorized/i);

  const item = await scenario({ recipientCount: 2 });
  const batchId = await draft(item.eventId);
  await generatePreview({ eventId: item.eventId, batchId });
  await db
    .update(notificationBatches)
    .set({ status: "authorized", authorizedBy: "integration-admin", authorizedAt: new Date() })
    .where(eq(notificationBatches.id, batchId));
  const delivered = new Map<string, number>();
  const transport: NotificationTransport = {
    async send(message) {
      await delay(20);
      delivered.set(message.to, (delivered.get(message.to) ?? 0) + 1);
      return { messageId: `synthetic-${message.to}` };
    },
  };
  await Promise.all([
    deliverBatch({ eventId: item.eventId, batchId, mode: "all", transport }),
    deliverBatch({ eventId: item.eventId, batchId, mode: "all", transport }),
  ]);
  assert.equal(delivered.size, 2);
  assert.deepEqual([...delivered.values()], [1, 1]);
  assert.deepEqual(
    (await rows(batchId)).map((recipient) => recipient.status),
    ["sent", "sent"]
  );
}

async function testNonAdminActions(): Promise<void> {
  const item = await scenario();
  const previous = process.env.DEV_AUTH;
  process.env.DEV_AUTH = "company";
  const imported = await import("../../app/admin/events/[eventId]/notifications/actions");
  type Actions = typeof import("../../app/admin/events/[eventId]/notifications/actions");
  const namespace = imported as unknown as Actions & { default?: Actions };
  const actions = namespace.default ?? namespace;
  const form = new FormData();
  form.set("eventId", item.eventId);
  form.set("batchId", randomUUID());
  form.set("audienceKind", "all_active");
  form.set("subject", "Synthetic");
  form.set("bodyTemplate", "Synthetic");
  form.set("previewRevision", "1");
  form.set("confirmExactPreview", "yes");
  await assert.rejects(() => actions.createBatchAction({ ok: false }, form), /Admin access required/);
  await assert.rejects(() => actions.previewBatchAction({ ok: false }, form), /Admin access required/);
  await assert.rejects(() => actions.authorizeBatchAction({ ok: false }, form), /Admin access required/);
  await assert.rejects(() => actions.retryFailedAction({ ok: false }, form), /Admin access required/);
  if (previous === undefined) delete process.env.DEV_AUTH;
  else process.env.DEV_AUTH = previous;
}

async function testStaffActorAuditIdentity(): Promise<void> {
  const item = await scenario();
  const previous = process.env.DEV_AUTH;
  process.env.DEV_AUTH = "admin";
  try {
    const { staffActorId } = await import("../staff-actor");
    const actorId = await staffActorId();
    const batchId = await createNotificationBatch({
      eventId: item.eventId,
      audienceKind: "all_active",
      subject: "Synthetic audit subject",
      bodyTemplate: "Synthetic audit body",
      createdBy: actorId,
    });
    const [batch] = await db
      .select()
      .from(notificationBatches)
      .where(eq(notificationBatches.id, batchId));
    assert.equal(batch.createdBy, "development-staff");
  } finally {
    if (previous === undefined) delete process.env.DEV_AUTH;
    else process.env.DEV_AUTH = previous;
  }
}

async function cleanup(): Promise<void> {
  for (const eventId of createdEventIds.reverse()) {
    await db.delete(events).where(eq(events.id, eventId));
  }
}

async function main(): Promise<void> {
  requireLocalTestDatabase();
  assert.equal(
    process.env.ATTORNEY_EMAIL_TRANSPORT,
    "capture",
    "Integration tests require capture transport; refusing any Resend path."
  );
  try {
    await testNonAdminActions();
    await testStaffActorAuditIdentity();
    await testStoredPreviewAndStaleness();
    await testAmbiguousEmails();
    await testRetries();
    await testInterruptedDeliveryLease();
    await testRecipientTimeoutIsolation();
    await testSystemFailureStopsAndResumesBatch();
    await testConcurrencyAndAuthorization();
    console.log("notification database integration passed");
  } finally {
    await cleanup();
  }
}

main().then(
  () => process.exit(0),
  async (error) => {
    try {
      await cleanup();
    } finally {
      console.error(error);
      process.exit(1);
    }
  }
);
