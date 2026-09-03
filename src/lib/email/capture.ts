import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EmailMessage, EmailTransport } from "./types";

const PRODUCTION_ERROR =
  "Local email capture is disabled when NODE_ENV=production; live magic links must never be written to disk.";

/** Test-only transport. Captures complete messages under ignored work/. */
export class LocalCaptureEmailTransport implements EmailTransport {
  constructor(
    private readonly captureDirectory = path.join(
      process.cwd(),
      "work",
      "email-capture"
    )
  ) {
    if (process.env.NODE_ENV === "production") throw new Error(PRODUCTION_ERROR);
  }

  async send(message: EmailMessage): Promise<void> {
    if (process.env.NODE_ENV === "production") throw new Error(PRODUCTION_ERROR);

    await mkdir(this.captureDirectory, { recursive: true });
    const capturePath = path.join(
      this.captureDirectory,
      `${Date.now()}-${randomUUID()}.json`
    );
    await writeFile(
      capturePath,
      JSON.stringify({ capturedAt: new Date().toISOString(), ...message }, null, 2),
      { encoding: "utf8", mode: 0o600, flag: "wx" }
    );
  }
}
