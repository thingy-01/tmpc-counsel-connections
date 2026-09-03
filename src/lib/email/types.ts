export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable across retries of the same logical delivery. */
  idempotencyKey?: string;
};

export type EmailSendResult = { messageId: string | null };

export type EmailFailureScope = "recipient" | "system";

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly scope: EmailFailureScope = "recipient"
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<EmailSendResult>;
}
