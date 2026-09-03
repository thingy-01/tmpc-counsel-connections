import { isSafeExternalUrl } from "@/lib/spreadsheet-safe";

/** Revalidate persisted references at the final rendering boundary. */
export function safeResumeReferenceHref(raw: string): string | null {
  return isSafeExternalUrl(raw) ? raw : null;
}
