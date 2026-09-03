import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  attorneyLoginRateLimits,
  attorneyTokens,
  attorneys,
  events,
} from "@/lib/db/schema";
import {
  assertAttorneyEmailConfigured,
  sendAttorneyMagicLink,
} from "@/lib/email";
import { asc, eq, sql } from "drizzle-orm";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_EMAIL_LENGTH = 320;

export type ConsumedAttorneyToken = {
  attorneyId: string;
  eventId: string;
};

export function normalizeAttorneyEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isPlausibleEmail(value: string): boolean {
  return (
    value.length > 2 &&
    value.length <= MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

/** Keep malformed/oversized input bounded while retaining stable throttling. */
export function attorneyRateLimitKey(normalizedEmail: string): string {
  if (normalizedEmail.length <= MAX_EMAIL_LENGTH) return normalizedEmail;
  return `invalid:${createHash("sha256").update(normalizedEmail).digest("hex")}`;
}

/**
 * Increment and decide in one INSERT ... ON CONFLICT statement. PostgreSQL
 * locks the conflicting row while evaluating the update, so concurrent
 * processes share one three-attempt budget.
 */
export async function claimAttorneyDeliveryAttempt(
  normalizedEmail: string
): Promise<boolean> {
  const expiredWindow = sql`${attorneyLoginRateLimits.windowStartedAt} <= now() - interval '15 minutes'`;
  const rows = await db
    .insert(attorneyLoginRateLimits)
    .values({
      normalizedEmail: attorneyRateLimitKey(normalizedEmail),
      windowStartedAt: sql`now()`,
      attempts: 1,
    })
    .onConflictDoUpdate({
      target: attorneyLoginRateLimits.normalizedEmail,
      set: {
        windowStartedAt: sql`case when ${expiredWindow} then now() else ${attorneyLoginRateLimits.windowStartedAt} end`,
        attempts: sql`case when ${expiredWindow} then 1 else ${attorneyLoginRateLimits.attempts} + 1 end`,
      },
    })
    .returning({ attempts: attorneyLoginRateLimits.attempts });

  return rows.length === 1 && rows[0].attempts <= 3;
}

function configuredAppUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not set. Attorney magic-link delivery is disabled."
    );
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be an absolute http(s) URL for attorney magic-link delivery."
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be an absolute http(s) URL for attorney magic-link delivery."
    );
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must use https in production for attorney magic-link delivery."
    );
  }
  return url;
}

/**
 * Select one event deterministically without accepting an event id from the
 * request. Current/upcoming events win; otherwise the latest historical event
 * wins. A normalized duplicate inside that event is intentionally ambiguous.
 */
async function resolveEnrollment(normalizedEmail: string): Promise<
  | {
      attorneyId: string;
      eventId: string;
      deliveryEmail: string;
    }
  | undefined
> {
  if (!isPlausibleEmail(normalizedEmail)) return undefined;

  const matches = await db
    .select({
      attorneyId: attorneys.id,
      eventId: attorneys.eventId,
      deliveryEmail: attorneys.email,
    })
    .from(attorneys)
    .innerJoin(events, eq(events.id, attorneys.eventId))
    .where(sql`lower(btrim(${attorneys.email})) = ${normalizedEmail}`)
    .orderBy(
      sql`case when ${events.endDate} >= current_date then 0 else 1 end`,
      sql`case when ${events.endDate} >= current_date then ${events.startDate} end asc`,
      sql`case when ${events.endDate} < current_date then ${events.endDate} end desc`,
      asc(events.id),
      asc(attorneys.id)
    );

  const selected = matches[0];
  if (!selected) return undefined;
  const selectedEventMatches = matches.filter(
    (match) => match.eventId === selected.eventId
  );
  if (selectedEventMatches.length !== 1) return undefined;
  return selected;
}

/** Runs only in Next's post-response callback to avoid an enrollment timing tell. */
export async function issueAndDeliverAttorneyMagicLink(
  normalizedEmail: string
): Promise<void> {
  // Validate delivery before minting a usable token. This runs for unknown
  // addresses too, but any failure remains server-side and post-response.
  assertAttorneyEmailConfigured();
  const appUrl = configuredAppUrl();
  const enrollment = await resolveEnrollment(normalizedEmail);
  if (!enrollment) return;

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.insert(attorneyTokens).values({
    attorneyId: enrollment.attorneyId,
    eventId: enrollment.eventId,
    tokenHash,
    expiresAt: sql`now() + interval '15 minutes'`,
  });

  const callback = new URL("/attorney/callback", appUrl);
  callback.searchParams.set("token", token);
  await sendAttorneyMagicLink(enrollment.deliveryEmail, callback.toString());
}

/**
 * Atomically mark a valid token used and return its exact binding. The
 * enrollment EXISTS predicate prevents a deleted or mismatched enrollment
 * from producing a session.
 */
export async function consumeAttorneyToken(
  token: string
): Promise<ConsumedAttorneyToken | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await db.execute<ConsumedAttorneyToken>(sql`
    update "attorney_tokens" as token
       set "used_at" = now()
     where token."token_hash" = ${tokenHash}
       and token."used_at" is null
       and token."expires_at" > now()
       and exists (
         select 1
           from "attorneys" as attorney
          where attorney."id" = token."attorney_id"
            and attorney."event_id" = token."event_id"
       )
     returning token."attorney_id" as "attorneyId",
               token."event_id" as "eventId"
  `);

  return result.rows.length === 1 ? result.rows[0] : null;
}
