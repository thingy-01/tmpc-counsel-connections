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
  index,
} from "drizzle-orm/pg-core";

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
