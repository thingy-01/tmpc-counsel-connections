import { createHash } from "node:crypto";
import type { ExistingAttorney, ParsedCandidate } from "./types";

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function isValidEmail(value: string): boolean {
  const normalized = normalizeEmail(value);
  return (
    normalized.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) &&
    !normalized.includes("..")
  );
}

/** Companion exports may list ordered alternate addresses separated by semicolons. */
export function firstValidEmail(value: string): string | null {
  for (const part of value.split(";")) {
    if (isValidEmail(part)) return normalizeEmail(part);
  }
  return null;
}

export function normalizeIdentityPart(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function identityKey(firstName: string, lastName: string, firm: string): string {
  return [firstName, lastName, firm].map(normalizeIdentityPart).join("|");
}

export function personKey(firstName: string, lastName: string): string {
  return [firstName, lastName].map(normalizeIdentityPart).join("|");
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stable(entry)])
    );
  }
  return value;
}

export function previewFingerprint(
  parsed: Omit<ParsedCandidate, "previewFingerprint">,
  matched: ExistingAttorney | null
): string {
  const matchSnapshot = matched
    ? {
        id: matched.id,
        firstName: matched.firstName,
        lastName: matched.lastName,
        email: normalizeEmail(matched.email),
        firm: matched.firm,
        city: matched.city,
        organizationType: matched.organizationType,
        practiceAreas: matched.practiceAreas,
        partnerCount: matched.partnerCount,
        associateCount: matched.associateCount,
        ofCounselCount: matched.ofCounselCount,
        status: matched.status,
        updatedAt: matched.updatedAt?.toISOString() ?? null,
      }
    : null;
  return createHash("sha256")
    .update(JSON.stringify(stable({ parsed, matchSnapshot })))
    .digest("hex");
}
