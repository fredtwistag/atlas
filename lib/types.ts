/**
 * Domain types for Atlas.
 *
 * These mirror the tenant-scoped tables in docs/02-architecture.md §4, trimmed
 * to what the UI consumes. When the Supabase + Drizzle backend lands, these are
 * replaced by inferred types from the schema — the shapes are intentionally
 * close so the swap is mechanical.
 */

export type Role = "ic" | "manager" | "sponsor";

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
  dimensionScores: DimensionScore[];
  rationale: string;
  status: OpportunityStatus;
  evidence: Capture[];
  contributorCount: number;
  patternMatch?: { title: string; deploys: number; similarity: number };
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
  health: "healthy" | "watch" | "at_risk";
  completionPct: number;
  opportunities: number;
  approved: number;
  engagementLead: string;
  alert?: string;
}
