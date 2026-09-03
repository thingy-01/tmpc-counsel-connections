import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test(
  "notification delivery integration uses only an isolated localhost database",
  { skip: !process.env.DATABASE_URL },
  () => {
    assert.ok(process.env.DATABASE_URL);
    const url = new URL(process.env.DATABASE_URL);
    assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-test-module-mocks",
        "--import",
        "tsx",
        "src/lib/notifications/service.integration-fixture.ts",
      ],
      { cwd: process.cwd(), env: process.env, encoding: "utf8", timeout: 120_000 }
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /integration passed/);
  }
);
