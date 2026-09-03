-- Additive Wave 2 foundation migration.
-- This repository has no production migration ledger; review and apply this
-- file directly once before enabling Wave 2 routes.

CREATE TABLE "roster_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "uploaded_by" text NOT NULL,
  "original_filename" text NOT NULL,
  "sheet_name" text,
  "file_sha256" text NOT NULL,
  "column_mapping" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "percent_format" text NOT NULL DEFAULT 'unspecified',
  "status" text NOT NULL DEFAULT 'draft',
  "source_row_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "applied_at" timestamp with time zone
);

CREATE INDEX "roster_imports_event_created_idx"
  ON "roster_imports" ("event_id", "created_at" DESC);

CREATE TABLE "roster_import_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "import_id" uuid NOT NULL REFERENCES "roster_imports"("id") ON DELETE CASCADE,
  "identity_key" text NOT NULL,
  "parsed" jsonb NOT NULL,
  "joined_email" text,
  "email_source" text NOT NULL DEFAULT 'none',
  "resolved_email" text,
  "match_attorney_id" uuid REFERENCES "attorneys"("id") ON DELETE SET NULL,
  "match_method" text NOT NULL DEFAULT 'none',
  "resolution" text NOT NULL DEFAULT 'pending',
  "issues" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "applied_action" text,
  "applied_attorney_id" uuid REFERENCES "attorneys"("id") ON DELETE SET NULL,
  "applied_error" text,
  "applied_at" timestamp with time zone,
  CONSTRAINT "roster_import_candidates_import_identity_unique"
    UNIQUE ("import_id", "identity_key")
);

CREATE TABLE "roster_import_rows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "import_id" uuid NOT NULL REFERENCES "roster_imports"("id") ON DELETE CASCADE,
  "row_number" integer NOT NULL,
  "raw" jsonb NOT NULL,
  "candidate_id" uuid REFERENCES "roster_import_candidates"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "roster_import_rows_import_row_unique"
    UNIQUE ("import_id", "row_number")
);

CREATE TABLE "attorney_resume_references" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "attorney_id" uuid NOT NULL REFERENCES "attorneys"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "label" text,
  "source" text NOT NULL,
  "import_id" uuid REFERENCES "roster_imports"("id") ON DELETE SET NULL,
  "added_by" text,
  "status" text NOT NULL DEFAULT 'unverified',
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "attorney_resume_references_attorney_url_unique"
    UNIQUE ("attorney_id", "url")
);

CREATE TABLE "attorney_reschedule_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assignment_id" uuid REFERENCES "assignments"("id") ON DELETE SET NULL,
  "attorney_id" uuid NOT NULL REFERENCES "attorneys"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "reason" text,
  "preferred_alternatives" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'open',
  "staff_note" text,
  "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "resolution_assignment_id" uuid REFERENCES "assignments"("id") ON DELETE SET NULL,
  "resolved_by" text,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX "attorney_reschedule_requests_active_unique"
  ON "attorney_reschedule_requests" ("assignment_id")
  WHERE "status" IN ('open', 'in_review') AND "assignment_id" IS NOT NULL;

CREATE INDEX "attorney_reschedule_requests_event_status_created_idx"
  ON "attorney_reschedule_requests" ("event_id", "status", "created_at");

CREATE TABLE "notification_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "kind" text NOT NULL DEFAULT 'schedule_announcement',
  "subject" text NOT NULL,
  "body_template" text NOT NULL,
  "audience" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'draft',
  "preview_revision" integer NOT NULL DEFAULT 0,
  "preview_hash" text,
  "previewed_at" timestamp with time zone,
  "created_by" text NOT NULL,
  "authorized_by" text,
  "authorized_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "completed_at" timestamp with time zone
);

CREATE TABLE "notification_recipients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL REFERENCES "notification_batches"("id") ON DELETE CASCADE,
  "attorney_id" uuid NOT NULL REFERENCES "attorneys"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "preview_revision" integer NOT NULL,
  "rendered_subject" text NOT NULL,
  "rendered_body" text NOT NULL,
  "content_hash" text NOT NULL,
  "provider_idempotency_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "provider_message_id" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "notification_recipients_batch_attorney_unique"
    UNIQUE ("batch_id", "attorney_id"),
  CONSTRAINT "notification_recipients_provider_idempotency_key_unique"
    UNIQUE ("provider_idempotency_key")
);

CREATE INDEX "notification_recipients_batch_status_idx"
  ON "notification_recipients" ("batch_id", "status");
