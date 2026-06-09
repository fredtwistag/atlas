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
