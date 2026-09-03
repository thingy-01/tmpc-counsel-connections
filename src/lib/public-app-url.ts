/**
 * Build an application URL without trusting a deployment proxy's internal
 * request origin. Production redirects require the configured public HTTPS
 * origin; local and test requests keep their own HTTP(S) origin.
 */
export function publicAppUrl(request: Request, path: string): URL {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Application URL paths must be root-relative.");
  }

  if (process.env.NODE_ENV !== "production") {
    const requestUrl = new URL(request.url);
    if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") {
      throw new Error("The request URL must use http or https.");
    }
    return new URL(path, requestUrl.origin);
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) {
    throw new Error("NEXT_PUBLIC_APP_URL is required in production.");
  }

  let publicUrl: URL;
  try {
    publicUrl = new URL(configured);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be an absolute HTTPS origin.");
  }

  if (
    publicUrl.protocol !== "https:" ||
    publicUrl.hostname === "localhost" ||
    publicUrl.hostname.endsWith(".localhost") ||
    publicUrl.hostname === "127.0.0.1" ||
    publicUrl.hostname === "[::1]" ||
    publicUrl.username ||
    publicUrl.password ||
    (publicUrl.pathname !== "/" && publicUrl.pathname !== "") ||
    publicUrl.search ||
    publicUrl.hash
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL must be an absolute HTTPS origin.");
  }

  return new URL(path, publicUrl.origin);
}
