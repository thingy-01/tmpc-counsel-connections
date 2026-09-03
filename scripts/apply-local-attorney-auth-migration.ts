import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";

async function main(): Promise<void> {
  const envFile = process.env.W1_TEST_ENV_FILE;
  if (!envFile) throw new Error("W1_TEST_ENV_FILE is required.");

  const loaded = config({
    path: resolve(process.cwd(), envFile),
    quiet: true,
  });
  if (loaded.error) throw new Error("Could not load W1_TEST_ENV_FILE.");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required in W1_TEST_ENV_FILE.");
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== "55432") {
    throw new Error("Refusing to apply a migration outside 127.0.0.1:55432.");
  }

  const migration = await readFile(
    resolve(process.cwd(), "drizzle/0001_attorney_magic_link_auth.sql"),
    "utf8"
  );
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(migration);
    console.log("Applied the attorney-auth migration to the guarded local database.");
  } finally {
    await pool.end();
  }
}

void main();
