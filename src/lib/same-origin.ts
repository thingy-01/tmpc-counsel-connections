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
      return new URL(origin).origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }

  return request.headers.get("sec-fetch-site") === "same-origin";
}
