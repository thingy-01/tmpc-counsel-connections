import "server-only";

import { LocalCaptureEmailTransport } from "./capture";
import { ResendEmailTransport } from "./resend";
import type { EmailMessage, EmailTransport } from "./types";

export type { EmailMessage, EmailTransport } from "./types";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. Attorney email is disabled.`);
  }
  return value;
}

function createTransport(): EmailTransport {
  const selected = process.env.ATTORNEY_EMAIL_TRANSPORT?.trim() || "resend";
  if (selected === "resend") {
    return new ResendEmailTransport(requiredEnvironment("RESEND_API_KEY"));
  }
  if (selected === "capture") {
    return new LocalCaptureEmailTransport();
  }
  throw new Error(
    `ATTORNEY_EMAIL_TRANSPORT must be "resend" or "capture"; received an unsupported setting.`
  );
}

export function assertAttorneyEmailConfigured(): void {
  const selected = process.env.ATTORNEY_EMAIL_TRANSPORT?.trim() || "resend";
  createTransport();
  if (selected === "resend") requiredEnvironment("ATTORNEY_EMAIL_FROM");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return replacements[character];
  });
}

export async function sendAttorneyMagicLink(
  recipient: string,
  magicLink: string
): Promise<void> {
  const transport = createTransport();
  const selected = process.env.ATTORNEY_EMAIL_TRANSPORT?.trim() || "resend";
  const from =
    selected === "capture"
      ? process.env.ATTORNEY_EMAIL_FROM?.trim() || "attorney-login@localhost"
      : requiredEnvironment("ATTORNEY_EMAIL_FROM");
  const safeLink = escapeHtml(magicLink);
  const message: EmailMessage = {
    from,
    to: recipient,
    subject: "Your Counsel Connections sign-in link",
    text: `Use this link to sign in to Counsel Connections. It expires in 15 minutes and can be used once:\n\n${magicLink}\n\nIf you did not request this link, you can ignore this email.`,
    html: `<p>Use the link below to sign in to Counsel Connections.</p><p><a href="${safeLink}">Sign in to Counsel Connections</a></p><p>This link expires in 15 minutes and can be used once.</p><p>If you did not request this link, you can ignore this email.</p>`,
  };
  await transport.send(message);
}
