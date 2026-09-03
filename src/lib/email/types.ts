export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}
