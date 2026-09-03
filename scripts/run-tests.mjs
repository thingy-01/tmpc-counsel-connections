import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

function refuseProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run tests with NODE_ENV=production.");
  }
}

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const tests = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      tests.push(...(await findTests(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      tests.push(entryPath);
    }
  }

  return tests;
}

function validateDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return;

  let databaseUrl;
  try {
    databaseUrl = new URL(raw);
  } catch {
    throw new Error("Refusing to run tests with an invalid DATABASE_URL.");
  }

  if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname)) {
    throw new Error(
      "Refusing to run tests: DATABASE_URL must use 127.0.0.1 or localhost."
    );
  }
}

async function main() {
  refuseProduction();

  const envFile = process.env.COUNSEL_TEST_ENV_FILE;
  if (envFile) {
    if (!path.isAbsolute(envFile)) {
      throw new Error("COUNSEL_TEST_ENV_FILE must be an absolute path.");
    }
    const result = dotenv.config({
      path: envFile,
      override: true,
      quiet: true,
    });
    if (result.error) {
      throw new Error(
        `Unable to load COUNSEL_TEST_ENV_FILE: ${result.error.message}`
      );
    }
  }

  refuseProduction();
  validateDatabaseUrl();

  const tests = (
    await Promise.all([
      findTests(path.resolve("src")),
      findTests(path.resolve("scripts")),
    ])
  )
    .flat()
    .sort();
  if (tests.length === 0) {
    throw new Error("No *.test.ts files found under src/ or scripts/.");
  }

  const child = spawnSync(
    process.execPath,
    ["--experimental-test-module-mocks", "--import", "tsx", "--test", ...tests],
    { stdio: "inherit", env: process.env }
  );

  if (child.error) throw child.error;
  if (child.status === null) {
    throw new Error(
      `Test process terminated by signal ${child.signal ?? "unknown"}.`
    );
  }
  process.exit(child.status);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Test harness error: ${message}`);
  process.exit(1);
});
