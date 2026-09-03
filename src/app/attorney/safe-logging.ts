export type AttorneyAuthOperation = "rate_limit" | "delivery" | "cleanup";
export type AttorneyAuthErrorCode = "internal_error";

/**
 * Deliberately ignores the supplied error object. Database and provider errors
 * may embed email addresses, SQL parameters, tokens, response bodies, or
 * connection details in their messages and causes.
 */
export function logAttorneyAuthFailure(
  operation: AttorneyAuthOperation,
  _error: unknown,
  logger: (message: string) => void = console.error
): void {
  const code: AttorneyAuthErrorCode = "internal_error";
  logger(JSON.stringify({ event: "attorney_auth_failure", operation, code }));
}
