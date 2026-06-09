/**
 * True if the error (or anything in its cause chain) is a violation of the
 * named constraint. Works across drivers: neon-http puts the constraint in
 * the message, node-postgres puts it on error.cause.constraint.
 */
export function constraintViolated(e: unknown, constraint: string): boolean {
  let current: unknown = e;
  for (let depth = 0; current && depth < 5; depth++) {
    const err = current as {
      constraint?: string;
      message?: string;
      cause?: unknown;
    };
    if (err.constraint === constraint) return true;
    if (typeof err.message === "string" && err.message.includes(constraint)) {
      return true;
    }
    current = err.cause;
  }
  return false;
}
