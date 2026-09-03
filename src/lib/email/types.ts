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

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<EmailSendResult>;
}
