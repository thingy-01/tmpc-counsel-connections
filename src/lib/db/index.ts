import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DB = NeonHttpDatabase<typeof schema>;

let _db: DB | undefined;

function getDb(): DB {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Configure it in your environment (Railway Variables / .env.local)."
      );
    }
    if (url.includes("neon.tech")) {
      _db = drizzleNeon(neon(url), { schema });
    } else {
      // Local/dev Postgres (Neon's HTTP driver only talks to neon.tech).
      // The two drizzle clients share the same query API, so callers don't care.
      _db = drizzlePg(new Pool({ connectionString: url }), {
        schema,
      }) as unknown as DB;
    }
  }
  return _db;
}

/**
 * Lazy DB proxy: importing this module never calls neon(), so a missing
 * DATABASE_URL at build time can't crash `next build`. The real connection is
 * created on first actual query (at runtime, where the env var is present).
 */
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance as object, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
}) as DB;

// Re-export all schema tables for convenience
export * from "./schema";
