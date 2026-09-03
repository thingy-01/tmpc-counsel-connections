import "server-only";

import {
  EmailDeliveryError,
  type EmailMessage,
  type EmailSendResult,
  type EmailTransport,
} from "./types";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";

/** Production email transport backed by Resend's documented HTTP API. */
export class ResendEmailTransport implements EmailTransport {
  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("RESEND_API_KEY is not set. Attorney email is disabled.");
    }
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const response = await fetch(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey
          ? { "Idempotency-Key": message.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      // Do not include the provider body: it may contain recipient or message
      // details, including the one-time link.
      let retryableConflict = false;
      if (response.status === 409) {
        const body = (await response.json().catch(() => null)) as {
          code?: unknown;
          name?: unknown;
        } | null;
        const errorCode =
          typeof body?.code === "string"
            ? body.code
            : typeof body?.name === "string"
              ? body.name
              : null;
        retryableConflict = errorCode === "concurrent_idempotent_requests";
      }
      throw new EmailDeliveryError(
        `Resend email delivery failed with status ${response.status}.`,
        response.status === 408 ||
          retryableConflict ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500
      );
    }
    const result = (await response.json()) as { id?: unknown };
    return { messageId: typeof result.id === "string" ? result.id : null };
  }
}
