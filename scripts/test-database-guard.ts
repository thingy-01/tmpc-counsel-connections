/**
 * Refuse database-writing tests unless they target an isolated local Postgres.
 * Call this inside every writing test or executable fixture so direct invocation
 * retains the same protection as the top-level test harness.
 */
export function requireLocalTestDatabase(
  raw = process.env.DATABASE_URL,
  options: { requiredPort?: string } = {}
): URL {
  if (!raw) {
    throw new Error("DATABASE_URL is required for database integration tests.");
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error("Refusing database test: DATABASE_URL is invalid.");
  }

  if (!["127.0.0.1", "localhost"].includes(target.hostname)) {
    throw new Error(
      "Refusing database test: DATABASE_URL must use 127.0.0.1 or localhost."
    );
  }
  if (options.requiredPort && target.port !== options.requiredPort) {
    throw new Error(
      `Refusing database test: DATABASE_URL must use local port ${options.requiredPort}.`
    );
  }
  return target;
}
