import "server-only";

import type { EmailMessage, EmailTransport } from "./types";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";

/** Production email transport backed by Resend's documented HTTP API. */
export class ResendEmailTransport implements EmailTransport {
  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("RESEND_API_KEY is not set. Attorney email is disabled.");
    }
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
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
      throw new Error(`Resend email delivery failed with status ${response.status}.`);
    }
  }
}
