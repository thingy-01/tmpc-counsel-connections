-- Additive production migration for attorney magic-link authentication.
-- This repository has no production migration ledger; review and apply this
-- file directly before enabling the attorney login routes.

CREATE TABLE IF NOT EXISTS "attorney_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "attorney_id" uuid NOT NULL REFERENCES "attorneys"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "attorney_tokens_attorney_event_idx"
  ON "attorney_tokens" ("attorney_id", "event_id");

CREATE TABLE IF NOT EXISTS "attorney_login_rate_limits" (
  "normalized_email" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "attempts" integer DEFAULT 1 NOT NULL
);
