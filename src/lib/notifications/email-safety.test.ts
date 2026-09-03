import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("tests use capture transport and never reach Resend", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "w2c-email-capture-"));
  const script = `
    globalThis.fetch = async () => { throw new Error("Resend path reached"); };
    const imported = await import("./src/lib/email/capture.ts");
    const LocalCaptureEmailTransport = imported.LocalCaptureEmailTransport ?? imported.default?.LocalCaptureEmailTransport;
    const transport = new LocalCaptureEmailTransport(${JSON.stringify(directory)});
    await transport.send({from:"sender@example.test",to:"recipient@example.test",subject:"Synthetic",text:"Body",html:"<p>Body</p>",idempotencyKey:"stable-test-key"});
  `;
  const result = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "--input-type=module", "--eval", script],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "test", ATTORNEY_EMAIL_TRANSPORT: "capture" },
      encoding: "utf8",
    }
  );
  assert.equal(result.status, 0, result.stderr);
  const files = await readdir(directory);
  assert.equal(files.length, 1);
  const captured = JSON.parse(await readFile(path.join(directory, files[0]), "utf8")) as {
    idempotencyKey?: string;
  };
  assert.equal(captured.idempotencyKey, "stable-test-key");
});

test("capture transport refuses to operate in production", () => {
  const script = `
    const imported = await import("./src/lib/email/capture.ts");
    const LocalCaptureEmailTransport = imported.LocalCaptureEmailTransport ?? imported.default?.LocalCaptureEmailTransport;
    try { new LocalCaptureEmailTransport(); process.exit(2); }
    catch (error) { if (!String(error).includes("disabled")) process.exit(3); }
  `;
  const result = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "--input-type=module", "--eval", script],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "production", ATTORNEY_EMAIL_TRANSPORT: "capture" },
      encoding: "utf8",
    }
  );
  assert.equal(result.status, 0, result.stderr);
});

test("Resend plumbing forwards the stable idempotency key and provider id", () => {
  const script = `
    let seenKey;
    globalThis.fetch = async (_url, options) => {
      seenKey = options.headers["Idempotency-Key"];
      return new Response(JSON.stringify({id:"provider-message-id"}), {status:200,headers:{"Content-Type":"application/json"}});
    };
    const imported = await import("./src/lib/email/resend.ts");
    const ResendEmailTransport = imported.ResendEmailTransport ?? imported.default?.ResendEmailTransport;
    const transport = new ResendEmailTransport("synthetic-key");
    const message = {from:"sender@example.test",to:"recipient@example.test",subject:"Synthetic",text:"Body",html:"<p>Body</p>",idempotencyKey:"stable-provider-key"};
    const result = await transport.send(message);
    if (seenKey !== "stable-provider-key" || result.messageId !== "provider-message-id") process.exit(2);
    globalThis.fetch = async () => new Response(JSON.stringify({name:"invalid_idempotent_request"}), {status:409,headers:{"Content-Type":"application/json"}});
    try { await transport.send(message); process.exit(3); }
    catch (error) { if (error.retryable !== false || error.scope !== "system") process.exit(4); }
    globalThis.fetch = async () => new Response(JSON.stringify({name:"concurrent_idempotent_requests"}), {status:409,headers:{"Content-Type":"application/json"}});
    try { await transport.send(message); process.exit(5); }
    catch (error) { if (error.retryable !== true || error.scope !== "system") process.exit(6); }
    globalThis.fetch = async () => new Response("", {status:403});
    try { await transport.send(message); process.exit(7); }
    catch (error) { if (error.retryable !== false || error.scope !== "system") process.exit(8); }
    globalThis.fetch = async () => { throw new Error("network unavailable"); };
    try { await transport.send(message); process.exit(9); }
    catch (error) { if (error.retryable !== true || error.scope !== "system") process.exit(10); }
  `;
  const result = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "--input-type=module", "--eval", script],
    { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test" }, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
});
