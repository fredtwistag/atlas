/**
 * Domain types for Atlas.
 *
 * These mirror the tenant-scoped tables in docs/02-architecture.md §4, trimmed
 * to what the UI consumes. When the Supabase + Drizzle backend lands, these are
 * replaced by inferred types from the schema — the shapes are intentionally
 * close so the swap is mechanical.
 */

export type Role = "ic" | "manager" | "sponsor";

/** A single source backing the company context (CTX-1): a doc, a URL, or manual note. */
export interface CompanyContextSource {
  kind: "web" | "document" | "manual";
  label: string;
  ref?: string;
}

/** Structured company profile (CTX-1). One per tenant; null fields = unknown. */
export interface CompanyContext {
  id: string;
  tenantId: string;
  summary: string | null;
  industry: string | null;
  businessModel: string | null;
  sizeBand: string | null;
  revenueBand: string | null;
  maturity: string | null;
  keySystems: string[];
  knownPains: string[];
  sources: CompanyContextSource[];
  status: "draft" | "active";
  enrichedBy: string | null;
  enrichedAt: string | null;
}

export type SprintStatus =
  | "draft"
  | "active"
  | "synthesizing"
  | "completed"
  | "paused";

export type ParticipantStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "idle";

export type SessionStatus =
  | "not_started"
  | "in_progress"
  | "paused"
  | "completed";

export type CaptureKind =
  | "bottleneck"
  | "workaround"
  | "tooling"
  | "handoff"
  | "frustration"
  | "sop"
  | "decision";

export type OpportunityStatus =
  | "provisional"
  | "surfaced"
  | "hidden"
  | "approved"
  | "deferred"
  | "declined";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  title: string;
}

export interface Topic {
  id: string;
  title: string;
  description: string;
  orderIdx: number;
  questionCount: number;
  estMinutes: number;
}

export interface Capture {
  id: string;
  kind: CaptureKind;
  summary: string;
  sourceQuote: string;
  /** Role only — never the individual's name in manager-facing views (privacy by design). */
  contributorRole: string;
  tags: string[];
  isEdited?: boolean;
  isRemoved?: boolean;
}

export interface SessionMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
}

export interface Session {
  id: string;
  topicId: string;
  topicTitle: string;
  userId: string;
  status: SessionStatus;
  totalSeconds?: number;
  messagesCount: number;
  captureCount: number;
  editWindowEndsAt?: string;
  completedAt?: string;
}

export interface Participant {
  user: User;
  status: ParticipantStatus;
  sessionsCompleted: number;
  sessionsTotal: number;
  lastActiveLabel: string;
  capturesContributed: number;
}

export interface DimensionScore {
  key: string;
  label: string;
  score: number; // 0–10
  reasoning: string;
}

export interface Opportunity {
  id: string;
  sprintId: string;
  title: string;
  description: string;
  category: string;
  departments: string[];
  impactLow: number; // USD/year
  impactHigh: number;
  timeToShipWeeksLow: number;
  timeToShipWeeksHigh: number;
  confidenceScore: number; // 1–5
  compositeScore: number; // 0–10, one decimal
  /** Funding horizon, derived in TS from the dimension scores (Ticket D). */
  horizon: Horizon;
  /** Delivery path: build a custom FDE, buy a vendor tool, or configure (Ticket C). */
  delivery: DeliveryPath;
  deliveryRationale: string;
  dimensionScores: DimensionScore[];
  rationale: string;
  status: OpportunityStatus;
  evidence: Capture[];
  contributorCount: number;
  patternMatch?: { title: string; deploys: number; similarity: number };
}

/**
 * Funding horizon for an opportunity (Ticket D). A barbell, not a flat list:
 * `quick_win` = cheap fast proof point; `strategic_bet` = big, slower or more
 * disruptive; `standard` = everything else.
 */
export type Horizon = "quick_win" | "strategic_bet" | "standard";

/**
 * Delivery path for an opportunity (Ticket C): `build` a custom FDE, `buy` a
 * mature vendor product, or `configure` a system the client already owns.
 */
export type DeliveryPath = "build" | "buy" | "configure";

/** One entry in the pilot portfolio (Ticket A), with display metadata. */
export interface PortfolioEntry {
  opportunityId: string;
  title: string;
  horizon: Horizon;
  delivery: DeliveryPath;
  impactLow: number;
  impactHigh: number;
  compositeScore: number;
  sequenceOrder: number;
  inclusionRationale: string;
}

/** The curated pilot portfolio for a sprint (Ticket A). */
export interface SprintPortfolio {
  status: "draft" | "surfaced";
  narrative: string;
  items: PortfolioEntry[];
}

/** A current-state system / shadow tool / integration gap (Ticket F). */
export type SystemCategory = "system" | "shadow_tool" | "integration_gap";

export interface SystemInventoryEntry {
  id: string;
  name: string;
  category: SystemCategory;
  summary: string;
}

/** Board-ready synthesis memo (Ticket G), cached on the sprint. */
export interface SynthesisMemo {
  openingNarrative: string;
  portfolioStory: string;
  sequencingLogic: string;
  riskNarrative: string;
  recommendedNextStep: string;
}

/** A role-level stakeholder in the sprint's approval/adoption chain (Ticket B). */
export type StakeholderType = "decision_maker" | "blocker" | "adopter";

export interface StakeholderEntry {
  id: string;
  roleLabel: string;
  department: string | null;
  type: StakeholderType;
  summary: string;
  gatedOpportunityIds: string[];
}

export interface SowDraft {
  title: string;
  scope: string;
  inclusions: string[];
  exclusions: string[];
  team: { role: string; allocation: string }[];
  durationWeeks: number;
  priceUsd: number;
  successMetrics: string[];
}

export interface ActivityItem {
  id: string;
  kind: "session_completed" | "opportunity_surfaced" | "nudge_sent" | "joined";
  label: string;
  timeLabel: string;
}

export interface Sprint {
  id: string;
  tenantName: string;
  tenantSegment: string;
  name: string;
  primaryFocus: string;
  scopeDepartment: string;
  status: SprintStatus;
  startDate: string;
  endDate: string;
  dayOf: number;
  dayTotal: number;
  cadence: string;
  topics: Topic[];
  participants: Participant[];
  sponsor: User;
  manager: User;
}

export interface SprintProgress {
  completionPct: number;
  weeklyActiveContributors: number;
  participantCount: number;
  sessionsCompleted: number;
  sessionsTotal: number;
  opportunitiesCount: number;
  highImpactCount: number;
  capturesCount: number;
  signalQuality: number; // sponsor-rated, /5
}

export interface MySessionView {
  id: string;
  topicId: string;
  topicTitle: string;
  topicDescription: string;
  estMinutes: number;
  status: SessionStatus;
  completedAt: string | null;
  editWindowEndsAt: string | null;
  captureCount: number;
  totalSeconds: number | null;
}

export interface MyDashboard {
  sprintId: string;
  sprintName: string;
  tenantName: string;
  sessions: MySessionView[];
}

export interface ClientSummary {
  tenantId: string;
  name: string;
  segment: string;
  sprintName: string;
  /** The active sprint this summary reflects, for deep-linking into its report.
   * Null when the tenant has no active sprint. */
  sprintId: string | null;
  health: "healthy" | "watch" | "at_risk";
  completionPct: number;
  opportunities: number;
  approved: number;
  alert?: string;
}
