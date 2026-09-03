import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Email-free company session.
 *
 * Companies (interview participants) log in with the invite code TMCP issues
 * them — no email verification, no Clerk account. We store the company id in an
 * HMAC-signed, httpOnly cookie so it can't be tampered with. This exists because
 * Clerk's email-code login can't reach many corporate/legal mail servers, which
 * was blocking participants from logging in at all.
 *
 * Admins still use Clerk (see src/lib/auth.ts) — only the company portal uses
 * this cookie session.
 */

const COOKIE = "tmcp_company";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const ATTORNEY_COOKIE = "tmcp_attorney";
const ATTORNEY_SESSION_VERSION = 1;
const ATTORNEY_MAX_AGE = 60 * 60 * 12; // 12 hours
const ATTORNEY_DEV_SECRET = "tmcp-attorney-development-only-secret";

export type AttorneySession = {
  v: typeof ATTORNEY_SESSION_VERSION;
  role: "attorney";
  attorneyId: string;
  eventId: string;
  exp: number;
};

function secret(): string {
  // CLERK_SECRET_KEY is always set in production, so signing is stable across
  // restarts without introducing a new required env var. SESSION_SECRET wins
  // if explicitly provided.
  return (
    process.env.SESSION_SECRET ||
    process.env.CLERK_SECRET_KEY ||
    "tmcp-dev-insecure-secret"
  );
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export async function setCompanySession(companyId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, `${companyId}.${sign(companyId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** The company id from a valid signed session cookie, or null. */
export async function getCompanySessionId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;

  const idx = raw.lastIndexOf(".");
  if (idx <= 0) return null;
  const id = raw.slice(0, idx);
  const providedSig = raw.slice(idx + 1);
  const expectedSig = sign(id);

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

export async function clearCompanySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

function attorneySecret(): string {
  const configured = process.env.ATTORNEY_SESSION_SECRET?.trim();
  if (configured) {
    if (
      process.env.NODE_ENV === "production" &&
      Buffer.byteLength(configured, "utf8") < 32
    ) {
      throw new Error(
        "ATTORNEY_SESSION_SECRET must be at least 32 bytes in production."
      );
    }
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ATTORNEY_SESSION_SECRET is not set. Attorney sessions are disabled in production."
    );
  }
  return ATTORNEY_DEV_SECRET;
}

function signAttorneyPayload(payload: string): string {
  return createHmac("sha256", attorneySecret())
    .update(payload)
    .digest("base64url");
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function isAttorneySession(value: unknown): value is AttorneySession {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.v === ATTORNEY_SESSION_VERSION &&
    payload.role === "attorney" &&
    isUuid(payload.attorneyId) &&
    isUuid(payload.eventId) &&
    typeof payload.exp === "number" &&
    Number.isSafeInteger(payload.exp)
  );
}

/** Throws a clear configuration error before a one-use token is consumed. */
export function assertAttorneySessionConfigured(): void {
  attorneySecret();
}

export async function setAttorneySession(
  attorneyId: string,
  eventId: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const payload: AttorneySession = {
    v: ATTORNEY_SESSION_VERSION,
    role: "attorney",
    attorneyId,
    eventId,
    exp: now + ATTORNEY_MAX_AGE,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const jar = await cookies();
  jar.set(ATTORNEY_COOKIE, `${encoded}.${signAttorneyPayload(encoded)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ATTORNEY_MAX_AGE,
  });
}

/**
 * Return a valid attorney-only session. The signed expiry is authoritative;
 * cookie maxAge is merely a browser cleanup hint.
 */
export async function getAttorneySession(): Promise<AttorneySession | null> {
  const jar = await cookies();
  const raw = jar.get(ATTORNEY_COOKIE)?.value;
  if (!raw) return null;

  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return null;
  const encoded = raw.slice(0, separator);
  const providedSignature = raw.slice(separator + 1);
  const expectedSignature = signAttorneyPayload(encoded);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
    if (!isAttorneySession(payload)) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function clearAttorneySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ATTORNEY_COOKIE);
}
