import { createHash, randomUUID } from "node:crypto";
import { renderScheduleAnnouncement } from "@/lib/email/templates/schedule-announcement";
import type {
  AudienceAttorney,
  PreviewRecipient,
  StoredAudience,
} from "./types";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function sourceHash(input: {
  event: { id: string; name: string; location: string | null; status: string };
  audience: StoredAudience;
  attorneys: AudienceAttorney[];
}): string {
  return hashValue({
    event: input.event,
    audience: { kind: input.audience.kind },
    attorneys: [...input.attorneys]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((attorney) => ({
        ...attorney,
        email: normalizeEmail(attorney.email),
        schedule: [...attorney.schedule].sort((a, b) =>
          a.assignmentId.localeCompare(b.assignmentId)
        ),
      })),
  });
}

export function buildPreview(input: {
  attorneys: AudienceAttorney[];
  eventName: string;
  portalUrl: string;
  subjectTemplate: string;
  bodyTemplate: string;
  makeIdempotencyKey?: () => string;
}): { recipients: PreviewRecipient[]; skippedDuplicateAttorneyIds: string[] } {
  const makeKey = input.makeIdempotencyKey ?? randomUUID;
  const unique = new Map<string, AudienceAttorney>();
  const skippedDuplicateAttorneyIds: string[] = [];
  for (const attorney of input.attorneys) {
    if (unique.has(attorney.id)) {
      skippedDuplicateAttorneyIds.push(attorney.id);
    } else {
      unique.set(attorney.id, attorney);
    }
  }

  const emailOwners = new Map<string, Set<string>>();
  for (const attorney of unique.values()) {
    const email = normalizeEmail(attorney.email);
    const owners = emailOwners.get(email) ?? new Set<string>();
    owners.add(attorney.id);
    emailOwners.set(email, owners);
  }

  const recipients = [...unique.values()]
    .sort((a, b) =>
      `${a.lastName}\0${a.firstName}\0${a.id}`.localeCompare(
        `${b.lastName}\0${b.firstName}\0${b.id}`
      )
    )
    .map((attorney): PreviewRecipient => {
      const email = normalizeEmail(attorney.email);
      const rendered = renderScheduleAnnouncement({
        attorney,
        eventName: input.eventName,
        portalUrl: input.portalUrl,
        subjectTemplate: input.subjectTemplate,
        bodyTemplate: input.bodyTemplate,
      });
      const status = !validEmail(email)
        ? "blocked_invalid"
        : (emailOwners.get(email)?.size ?? 0) > 1
          ? "blocked_ambiguous"
          : "pending";
      return {
        attorneyId: attorney.id,
        name: `${attorney.firstName} ${attorney.lastName}`,
        email,
        renderedSubject: rendered.subject,
        renderedBody: rendered.body,
        contentHash: hashValue(rendered),
        providerIdempotencyKey: makeKey(),
        status,
      };
    });

  return { recipients, skippedDuplicateAttorneyIds };
}

export function previewHash(recipients: PreviewRecipient[]): string {
  return hashValue(
    recipients.map((recipient) => ({
      attorneyId: recipient.attorneyId,
      email: recipient.email,
      renderedSubject: recipient.renderedSubject,
      renderedBody: recipient.renderedBody,
      contentHash: recipient.contentHash,
      providerIdempotencyKey: recipient.providerIdempotencyKey,
      status: recipient.status,
    }))
  );
}
