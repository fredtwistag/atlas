import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  date,
  bigserial,
  unique,
  integer,
  numeric,
  doublePrecision,
  primaryKey,
} from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  segment: text("segment").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  metadata: jsonb("metadata").default({}),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id"),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  targetId: text("target_id"),
  metadata: jsonb("metadata").default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const twistagUsers = pgTable("twistag_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"),
    invitedByKind: text("invited_by_kind").notNull(),
    invitedById: uuid("invited_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => ({ uniqEmail: unique().on(t.tenantId, t.email) }),
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    department: text("department"),
    title: text("title"),
    optedOut: boolean("opted_out").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({ uniqEmail: unique().on(t.tenantId, t.email) }),
);

export const sprints = pgTable("sprints", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  scopeDepartment: text("scope_department"),
  primaryFocus: text("primary_focus").notNull(),
  customFocus: text("custom_focus"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  cadence: text("cadence").notNull(),
  status: text("status").notNull(),
  sponsorId: uuid("sponsor_id").references(() => users.id),
  managerId: uuid("manager_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const topics = pgTable("topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sprintId: uuid("sprint_id")
    .notNull()
    .references(() => sprints.id),
  title: text("title").notNull(),
  description: text("description"),
  orderIdx: integer("order_idx").notNull(),
  questionCount: integer("question_count").notNull(),
  estMinutes: integer("est_minutes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sprintParticipants = pgTable(
  "sprint_participants",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => sprints.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull(),
    sessionsCompleted: integer("sessions_completed").notNull().default(0),
    sessionsTotal: integer("sessions_total").notNull().default(4),
    lastActiveLabel: text("last_active_label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sprintId, t.userId] }) }),
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sprintId: uuid("sprint_id")
    .notNull()
    .references(() => sprints.id),
  topicId: uuid("topic_id").references(() => topics.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull(),
  totalSeconds: integer("total_seconds"),
  messagesCount: integer("messages_count").notNull().default(0),
  captureCount: integer("capture_count").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  editWindowEndsAt: timestamp("edit_window_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const captures = pgTable("captures", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sessionId: uuid("session_id").references(() => sessions.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  sourceQuote: text("source_quote").notNull(),
  tags: text("tags").array().notNull().default([]),
  isEdited: boolean("is_edited").notNull().default(false),
  isRemoved: boolean("is_removed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sprintId: uuid("sprint_id")
    .notNull()
    .references(() => sprints.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  departments: text("departments").array().notNull().default([]),
  impactLow: integer("impact_low").notNull(),
  impactHigh: integer("impact_high").notNull(),
  timeToShipWeeksLow: integer("time_to_ship_weeks_low").notNull(),
  timeToShipWeeksHigh: integer("time_to_ship_weeks_high").notNull(),
  confidenceScore: integer("confidence_score").notNull(),
  compositeScore: numeric("composite_score", {
    precision: 3,
    scale: 1,
  }).notNull(),
  dimensionScores: jsonb("dimension_scores").notNull(),
  rationale: text("rationale").notNull(),
  status: text("status").notNull(),
  contributorCount: integer("contributor_count").notNull().default(0),
  patternMatch: jsonb("pattern_match"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const opportunityEvidence = pgTable(
  "opportunity_evidence",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id),
    captureId: uuid("capture_id")
      .notNull()
      .references(() => captures.id),
    weight: doublePrecision("weight").notNull().default(1),
  },
  (t) => ({ pk: primaryKey({ columns: [t.opportunityId, t.captureId] }) }),
);
