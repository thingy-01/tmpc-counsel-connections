/**
 * Require a browser POST to come from this origin.
 *
 * `Referrer-Policy: no-referrer` makes Chromium serialize a same-origin form
 * submission's Origin as the opaque value `null`. In that case (and when an
 * Origin is omitted), Fetch Metadata must explicitly identify the request as
 * same-origin. An explicit, non-opaque Origin remains authoritative.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    try {
      const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
      const target =
        process.env.NODE_ENV === "production" && configured
          ? new URL(configured)
          : new URL(request.url);
      if (
        target.protocol !== "http:" &&
        target.protocol !== "https:"
      ) {
        return false;
      }
      if (process.env.NODE_ENV === "production" && target.protocol !== "https:") {
        return false;
      }
      return new URL(origin).origin === target.origin;
    } catch {
      return false;
    }
  }

  return request.headers.get("sec-fetch-site") === "same-origin";
}
