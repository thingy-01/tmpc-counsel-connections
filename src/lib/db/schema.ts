import {
  pgTable,
  uuid,
  text,
  date,
  time,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================
// 1. events
// ============================================================
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  slotDuration: integer("slot_duration").notNull().default(15),
  status: text("status").notNull().default("draft"), // draft | open | closed
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// 2. event_days
// ============================================================
export const eventDays = pgTable(
  "event_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    label: text("label").notNull(),
    format: text("format").notNull().default("in_person"), // virtual | in_person
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [unique("event_days_event_date_unique").on(table.eventId, table.date)]
);

// ============================================================
// 3. break_periods
// ============================================================
export const breakPeriods = pgTable("break_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventDayId: uuid("event_day_id")
    .notNull()
    .references(() => eventDays.id, { onDelete: "cascade" }),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// 4. time_slots
// ============================================================
export const timeSlots = pgTable(
  "time_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventDayId: uuid("event_day_id")
      .notNull()
      .references(() => eventDays.id, { onDelete: "cascade" }),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [unique("time_slots_day_start_unique").on(table.eventDayId, table.startTime)]
);

// ============================================================
// 5. attorneys
// ============================================================
export const attorneys = pgTable(
  "attorneys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    firm: text("firm").notNull(),
    city: text("city"),
    organizationType: text("organization_type"),
    practiceAreas: jsonb("practice_areas").default([]),
    partnerCount: integer("partner_count"),
    associateCount: integer("associate_count"),
    ofCounselCount: integer("of_counsel_count"),
    // Denormalized convenience flag: true when the attorney has >= 1 row in
    // attorney_unavailability. Maintained by the unavailability server actions.
    isUnavailable: boolean("is_unavailable").default(false),
    unavailableNote: text("unavailable_note"),
    // Lifecycle only. "Unavailable" is NOT a status value — it is time-specific
    // and derived from attorney_unavailability rows. withdrawn = excluded from selection.
    status: text("status").notNull().default("active"), // active | withdrawn
    // Resume (PDF only). resumePath is relative to RESUME_STORAGE_DIR (Railway Volume).
    resumePath: text("resume_path"),
    resumeOriginalName: text("resume_original_name"),
    resumeSize: integer("resume_size"),
    resumeUploadedAt: timestamp("resume_uploaded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [unique("attorneys_event_email_unique").on(table.eventId, table.email)]
);

// ============================================================
// 6. attorney_unavailability
// ============================================================
export const attorneyUnavailability = pgTable("attorney_unavailability", {
  id: uuid("id").primaryKey().defaultRandom(),
  attorneyId: uuid("attorney_id")
    .notNull()
    .references(() => attorneys.id, { onDelete: "cascade" }),
  timeSlotId: uuid("time_slot_id").references(() => timeSlots.id, {
    onDelete: "cascade",
  }),
  eventDayId: uuid("event_day_id").references(() => eventDays.id, {
    onDelete: "cascade",
  }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// 7. companies
// ============================================================
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    website: text("website"),
    streetAddress: text("street_address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    description: text("description"),
    legalStaffCount: integer("legal_staff_count"),
    practiceAreas: jsonb("practice_areas").default([]),
    outsideCounselNeed: text("outside_counsel_need"), // low | medium | high
    preferredPlatform: text("preferred_platform"), // zoom | teams | webex | phone | other
    clerkUserId: text("clerk_user_id"),
    contactName: text("contact_name"),
    contactTitle: text("contact_title"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    inviteCode: text("invite_code").unique(),
    status: text("status").notNull().default("invited"), // invited | registered | selections_complete
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("companies_event_name_unique").on(table.eventId, table.name),
    // One Clerk account can claim at most one company (nullable: many unclaimed rows allowed).
    unique("companies_clerk_user_id_unique").on(table.clerkUserId),
  ]
);

// ============================================================
// 8. company_interviewers
// ============================================================
export const companyInterviewers = pgTable("company_interviewers", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// 9. company_slot_selections
// ============================================================
export const companySlotSelections = pgTable(
  "company_slot_selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    timeSlotId: uuid("time_slot_id")
      .notNull()
      .references(() => timeSlots.id, { onDelete: "cascade" }),
    interviewerId: uuid("interviewer_id").references(
      () => companyInterviewers.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("company_slot_selections_unique").on(table.companyId, table.timeSlotId),
  ]
);

// ============================================================
// 10. assignments
// ============================================================
export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    attorneyId: uuid("attorney_id")
      .notNull()
      .references(() => attorneys.id, { onDelete: "cascade" }),
    timeSlotId: uuid("time_slot_id")
      .notNull()
      .references(() => timeSlots.id, { onDelete: "cascade" }),
    interviewerId: uuid("interviewer_id").references(
      () => companyInterviewers.id,
      { onDelete: "set null" }
    ),
    source: text("source").notNull().default("company"), // company | admin
    notes: text("notes"),
    status: text("status").notNull().default("confirmed"), // confirmed | cancelled
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    // An attorney can only be in one interview per slot
    unique("assignments_attorney_slot_unique").on(table.attorneyId, table.timeSlotId),
    // A company can only interview one attorney per slot
    unique("assignments_company_slot_unique").on(table.companyId, table.timeSlotId),
  ]
);

// ============================================================
// 11. admin_users
// ============================================================
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  name: text("name"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// 12. attorney_tokens
// ============================================================
export const attorneyTokens = pgTable(
  "attorney_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attorneyId: uuid("attorney_id")
      .notNull()
      .references(() => attorneys.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("attorney_tokens_attorney_event_idx").on(
      table.attorneyId,
      table.eventId
    ),
  ]
);

// ============================================================
// 13. attorney_login_rate_limits
// ============================================================
export const attorneyLoginRateLimits = pgTable("attorney_login_rate_limits", {
  normalizedEmail: text("normalized_email").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  attempts: integer("attempts").notNull().default(1),
});

// ============================================================
// 14. roster_imports
// ============================================================
export const rosterImports = pgTable(
  "roster_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").notNull(),
    originalFilename: text("original_filename").notNull(),
    sheetName: text("sheet_name"),
    fileSha256: text("file_sha256").notNull(),
    columnMapping: jsonb("column_mapping").notNull().default({}),
    percentFormat: text("percent_format").notNull().default("unspecified"),
    status: text("status").notNull().default("draft"),
    sourceRowCount: integer("source_row_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => [
    index("roster_imports_event_created_idx").on(
      table.eventId,
      table.createdAt.desc()
    ),
  ]
);

// ============================================================
// 15. roster_import_candidates
// ============================================================
export const rosterImportCandidates = pgTable(
  "roster_import_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => rosterImports.id, { onDelete: "cascade" }),
    identityKey: text("identity_key").notNull(),
    parsed: jsonb("parsed").notNull(),
    joinedEmail: text("joined_email"),
    emailSource: text("email_source").notNull().default("none"),
    resolvedEmail: text("resolved_email"),
    matchAttorneyId: uuid("match_attorney_id").references(() => attorneys.id, {
      onDelete: "set null",
    }),
    matchMethod: text("match_method").notNull().default("none"),
    resolution: text("resolution").notNull().default("pending"),
    issues: jsonb("issues").notNull().default([]),
    appliedAction: text("applied_action"),
    appliedAttorneyId: uuid("applied_attorney_id").references(
      () => attorneys.id,
      { onDelete: "set null" }
    ),
    appliedError: text("applied_error"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => [
    unique("roster_import_candidates_import_identity_unique").on(
      table.importId,
      table.identityKey
    ),
  ]
);

// ============================================================
// 16. roster_import_rows
// ============================================================
export const rosterImportRows = pgTable(
  "roster_import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => rosterImports.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").notNull(),
    candidateId: uuid("candidate_id").references(
      () => rosterImportCandidates.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("roster_import_rows_import_row_unique").on(
      table.importId,
      table.rowNumber
    ),
  ]
);

// ============================================================
// 17. attorney_resume_references
// ============================================================
export const attorneyResumeReferences = pgTable(
  "attorney_resume_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attorneyId: uuid("attorney_id")
      .notNull()
      .references(() => attorneys.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    label: text("label"),
    source: text("source").notNull(),
    importId: uuid("import_id").references(() => rosterImports.id, {
      onDelete: "set null",
    }),
    addedBy: text("added_by"),
    status: text("status").notNull().default("unverified"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("attorney_resume_references_attorney_url_unique").on(
      table.attorneyId,
      table.url
    ),
  ]
);

// ============================================================
// 18. attorney_reschedule_requests
// ============================================================
export const attorneyRescheduleRequests = pgTable(
  "attorney_reschedule_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id").references(() => assignments.id, {
      onDelete: "set null",
    }),
    attorneyId: uuid("attorney_id")
      .notNull()
      .references(() => attorneys.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    reason: text("reason"),
    preferredAlternatives: jsonb("preferred_alternatives")
      .notNull()
      .default([]),
    status: text("status").notNull().default("open"),
    staffNote: text("staff_note"),
    snapshot: jsonb("snapshot").notNull().default({}),
    resolutionAssignmentId: uuid("resolution_assignment_id").references(
      () => assignments.id,
      { onDelete: "set null" }
    ),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("attorney_reschedule_requests_active_unique")
      .on(table.assignmentId)
      .where(
        sql`${table.status} IN ('open', 'in_review') AND ${table.assignmentId} IS NOT NULL`
      ),
    index("attorney_reschedule_requests_event_status_created_idx").on(
      table.eventId,
      table.status,
      table.createdAt
    ),
  ]
);

// ============================================================
// 19. notification_batches
// ============================================================
export const notificationBatches = pgTable("notification_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("schedule_announcement"),
  subject: text("subject").notNull(),
  bodyTemplate: text("body_template").notNull(),
  audience: jsonb("audience").notNull().default({}),
  status: text("status").notNull().default("draft"),
  previewRevision: integer("preview_revision").notNull().default(0),
  previewHash: text("preview_hash"),
  previewedAt: timestamp("previewed_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  authorizedBy: text("authorized_by"),
  authorizedAt: timestamp("authorized_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ============================================================
// 20. notification_recipients
// ============================================================
export const notificationRecipients = pgTable(
  "notification_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => notificationBatches.id, { onDelete: "cascade" }),
    attorneyId: uuid("attorney_id")
      .notNull()
      .references(() => attorneys.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    previewRevision: integer("preview_revision").notNull(),
    renderedSubject: text("rendered_subject").notNull(),
    renderedBody: text("rendered_body").notNull(),
    contentHash: text("content_hash").notNull(),
    providerIdempotencyKey: text("provider_idempotency_key").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("notification_recipients_batch_attorney_unique").on(
      table.batchId,
      table.attorneyId
    ),
    unique("notification_recipients_provider_idempotency_key_unique").on(
      table.providerIdempotencyKey
    ),
    index("notification_recipients_batch_status_idx").on(
      table.batchId,
      table.status
    ),
  ]
);
