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
