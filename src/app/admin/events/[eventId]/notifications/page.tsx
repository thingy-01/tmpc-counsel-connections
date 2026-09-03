import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { getRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  attorneys,
  notificationBatches,
  notificationRecipients,
} from "@/lib/db/schema";
import { loadEventAudience, loadMailMergeAttorneys } from "@/lib/notifications/data";
import { buildMailMergeTable } from "@/lib/notifications/mail-merge";
import { AUDIENCE_OPTIONS, type AudienceKind } from "@/lib/notifications/types";
import {
  AuthorizeBatch,
  ComposeBatch,
  PreviewBatchButton,
  RetryFailed,
} from "./notification-controls";

export const dynamic = "force-dynamic";

function statusClass(status: string): string {
  if (status === "sent") return "bg-emerald-100 text-emerald-800";
  if (status.startsWith("blocked_") || status.startsWith("failed")) {
    return "bg-red-100 text-red-800";
  }
  if (status === "sending") return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  if ((await getRole()) !== "admin") redirect("/");
  const { eventId } = await params;
  const counts = await Promise.all(
    AUDIENCE_OPTIONS.map(async (option) => ({
      ...option,
      count: (await loadEventAudience(eventId, { kind: option.kind })).attorneys.length,
    }))
  ).catch(() => null);
  if (!counts) notFound();

  const [batches, mergeAttorneys] = await Promise.all([
    db
      .select()
      .from(notificationBatches)
      .where(eq(notificationBatches.eventId, eventId))
      .orderBy(desc(notificationBatches.createdAt)),
    loadMailMergeAttorneys(eventId),
  ]);
  const batchIds = new Set(batches.map((batch) => batch.id));
  const recipients = batchIds.size
    ? await db
        .select()
        .from(notificationRecipients)
        .innerJoin(
          notificationBatches,
          and(
            eq(notificationRecipients.batchId, notificationBatches.id),
            eq(notificationBatches.eventId, eventId)
          )
        )
        .innerJoin(
          attorneys,
          eq(notificationRecipients.attorneyId, attorneys.id)
        )
        .orderBy(
          desc(notificationRecipients.previewRevision),
          asc(notificationRecipients.email)
        )
    : [];
  const recipientsByBatch = new Map<
    string,
    Array<typeof notificationRecipients.$inferSelect & { attorneyName: string }>
  >();
  for (const row of recipients) {
    const list = recipientsByBatch.get(row.notification_recipients.batchId) ?? [];
    list.push({
      ...row.notification_recipients,
      attorneyName: `${row.attorneys.firstName} ${row.attorneys.lastName}`,
    });
    recipientsByBatch.set(row.notification_recipients.batchId, list);
  }
  const merge = buildMailMergeTable(mergeAttorneys);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
        <p className="mt-1 text-slate-500">
          Draft, snapshot, explicitly authorize, and inspect each delivery result.
        </p>
      </div>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Mail-merge schedule export</h2>
            <p className="mt-1 text-sm text-slate-500">
              Word-compatible headers through group {merge.groupCount}; groups 1–9 match
              the tracked assignments workbook.
            </p>
          </div>
          <Link
            href={`/api/admin/export/schedule?eventId=${encodeURIComponent(eventId)}`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Download assignments workbook
          </Link>
        </div>
        {merge.overflowAttorneys.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-semibold">More than eight interviews (all are exported):</p>
            <ul className="mt-1 list-disc pl-5">
              {merge.overflowAttorneys.map((attorney) => (
                <li key={attorney.id}>
                  {attorney.name} — {attorney.count} interviews
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-slate-900">Current audience counts</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {counts.map((option) => (
            <div key={option.kind} className="rounded-lg border bg-white p-4">
              <p className="text-2xl font-bold text-slate-900">{option.count}</p>
              <p className="text-sm text-slate-600">{option.label}</p>
            </div>
          ))}
        </div>
      </section>

      <ComposeBatch eventId={eventId} />

      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-900">2. Preview, then authorize</h2>
        {batches.length === 0 && (
          <p className="rounded-lg border bg-white p-6 text-slate-500">No drafts yet.</p>
        )}
        {batches.map((batch) => {
          const batchRecipients = recipientsByBatch.get(batch.id) ?? [];
          const audience = batch.audience as { kind?: AudienceKind };
          const audienceLabel = AUDIENCE_OPTIONS.find(
            (option) => option.kind === audience.kind
          )?.label;
          const retryable = batchRecipients.some(
            (recipient) => recipient.status === "failed" && recipient.attempts < 3
          );
          const canAuthorize =
            batch.status === "previewed" && batchRecipients.length > 0;
          return (
            <article key={batch.id} className="rounded-lg border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {audienceLabel ?? "Invalid audience"}
                  </p>
                  <h3 className="mt-1 font-semibold text-slate-900">{batch.subject}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Status: {batch.status} · preview revision {batch.previewRevision}
                  </p>
                </div>
                <PreviewBatchButton eventId={eventId} batchId={batch.id} />
              </div>

              {batchRecipients.length > 0 && (
                <div className="mt-5 space-y-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Exact stored preview — {batchRecipients.length} recipient rows
                  </p>
                  {batchRecipients.map((recipient) => (
                    <details
                      key={recipient.id}
                      open={recipient.status.startsWith("blocked_")}
                      className={`rounded-md border p-3 ${
                        recipient.status.startsWith("blocked_")
                          ? "border-red-300 bg-red-50"
                          : "bg-slate-50"
                      }`}
                    >
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm">
                            <span className="font-semibold">{recipient.attorneyName}</span>{" "}
                            <span className="font-mono text-slate-600">&lt;{recipient.email}&gt;</span>
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(recipient.status)}`}>
                            {recipient.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          attempts {recipient.attempts}/3 · provider id {recipient.providerMessageId ?? "—"}
                          {recipient.lastError ? ` · ${recipient.lastError}` : ""}
                        </p>
                      </summary>
                      <div className="mt-3 border-t pt-3">
                        <p className="text-sm font-semibold text-slate-800">
                          Subject: {recipient.renderedSubject}
                        </p>
                        <pre className="mt-2 whitespace-pre-wrap rounded border bg-white p-3 font-sans text-sm text-slate-700">
                          {recipient.renderedBody}
                        </pre>
                      </div>
                    </details>
                  ))}

                  {canAuthorize && (
                    <AuthorizeBatch
                      eventId={eventId}
                      batchId={batch.id}
                      previewRevision={batch.previewRevision}
                      disabled={batchRecipients.every((recipient) =>
                        recipient.status.startsWith("blocked_")
                      )}
                    />
                  )}
                  {retryable && <RetryFailed eventId={eventId} batchId={batch.id} />}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
