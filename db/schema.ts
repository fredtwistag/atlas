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

/**
 * Structured company profile (CTX-1), one row per tenant. Read by tenant users
 * (injected into prompts server-side) but written only via service_role /
 * Twistag — see migration 0011 RLS. Populated by enrichment (CTX-2/3) and
 * consumed by prompts/scoring/report (CTX-4).
 */
export const companyContext = pgTable("company_context", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id),
  summary: text("summary"),
  industry: text("industry"),
  businessModel: text("business_model"),
  sizeBand: text("size_band"),
  revenueBand: text("revenue_band"),
  maturity: text("maturity"),
  keySystems: text("key_systems").array().notNull().default([]),
  knownPains: text("known_pains").array().notNull().default([]),
  sources: jsonb("sources").notNull().default([]),
  status: text("status").notNull().default("draft"),
  enrichedBy: text("enriched_by"),
  enrichedAt: timestamp("enriched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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

/**
 * Fixed-window rate limiter state. INFRASTRUCTURE, not tenant data: no tenant_id,
 * no client-readable RLS (service-role-only, like audit_log). One row per
 * namespaced `key`; `windowStartsAt` + `count` track the current window. Written
 * exclusively via lib/rate-limit.ts `consume()`. See migration 0007.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStartsAt: timestamp("window_starts_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  count: integer("count").notNull().default(0),
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
    // 14-day expiry, enforced at acceptance time (plan 025). Set at every
    // invite-creation site; a resend refreshes it. Nullable for historical rows;
    // the acceptance check treats NULL/past as expired.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
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
    // GDPR Art. 21 objection right (plan 025): when false, manager nudges and
    // system idle reminders skip this IC. Default true (opted in). Toggled on /me.
    allowNudges: boolean("allow_nudges").notNull().default(true),
    privacyAckAt: timestamp("privacy_ack_at", { withTimezone: true }),
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
  // Per-role loaded hourly rate (USD), keyed by role/title label (EXT-2).
  // Set by the manager at sprint setup (EXT-2b). NULL → scoring uses a
  // benchmark default. Shape: { "Sales rep": 65, "default": 75 }.
  costBasis: jsonb("cost_basis"),
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

export const sessionMessages = pgTable("session_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  // The owning contributor. Drives the owner-only SELECT RLS policy so a
  // same-tenant manager cannot read an IC's transcript (CLAUDE.md privacy).
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role").notNull(), // "assistant" | "user"
  content: text("content").notNull(),
  arc: text("arc").notNull(),
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
  // Structured quantified impact (EXT-2), nullable — set only when the
  // contributor stated numbers. Scoring multiplies these into annual dollars.
  quantifiedFrequencyPerYear: numeric("quantified_frequency_per_year", {
    precision: 12,
    scale: 2,
  }),
  quantifiedUnitMinutes: numeric("quantified_unit_minutes", {
    precision: 12,
    scale: 2,
  }),
  quantifiedUnitCostUsd: numeric("quantified_unit_cost_usd", {
    precision: 14,
    scale: 2,
  }),
  quantifiedBasis: text("quantified_basis"),
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
  // Funding horizon derived in TS from dimension scores (Ticket D).
  horizon: text("horizon").notNull().default("standard"),
  // Delivery path: build | buy | configure (Ticket C).
  delivery: text("delivery").notNull().default("build"),
  deliveryRationale: text("delivery_rationale").notNull().default(""),
  dimensionScores: jsonb("dimension_scores").notNull(),
  rationale: text("rationale").notNull(),
  status: text("status").notNull(),
  contributorCount: integer("contributor_count").notNull().default(0),
  patternMatch: jsonb("pattern_match"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => users.id),
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

/**
 * Pilot Portfolio (Ticket A): a curated 3-5 opportunity recommendation per
 * sprint + the LLM narrative framing it. One per sprint; generated `draft` by
 * recompute, surfaced by Twistag. Writes are service-role only (see 0014 RLS).
 */
export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sprintId: uuid("sprint_id")
    .notNull()
    .unique()
    .references(() => sprints.id),
  narrative: text("narrative").notNull().default(""),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const portfolioItems = pgTable(
  "portfolio_items",
  {
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sequenceOrder: integer("sequence_order").notNull(),
    inclusionRationale: text("inclusion_rationale").notNull().default(""),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.portfolioId, t.opportunityId] }),
  }),
);

export const sowDrafts = pgTable("sow_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  opportunityId: uuid("opportunity_id")
    .notNull()
    .references(() => opportunities.id),
  sprintId: uuid("sprint_id")
    .notNull()
    .references(() => sprints.id),
  title: text("title").notNull(),
  scope: text("scope").notNull(),
  inclusions: text("inclusions").array().notNull().default([]),
  exclusions: text("exclusions").array().notNull().default([]),
  team: jsonb("team").notNull(),
  durationWeeks: integer("duration_weeks").notNull(),
  priceUsd: integer("price_usd").notNull(),
  successMetrics: text("success_metrics").array().notNull().default([]),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
