/**
 * Centralized UI mappings from domain enums to presentational tokens.
 * One home so badge tones/labels can't drift across screens.
 */
import type {
  ParticipantStatus,
  ClientSummary,
  CaptureKind,
  OpportunityStatus,
  Horizon,
  DeliveryPath,
} from "./types";

type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "outline";

export const participantStatusMeta: Record<
  ParticipantStatus,
  { label: string; tone: BadgeTone }
> = {
  completed: { label: "Complete", tone: "success" },
  in_progress: { label: "In progress", tone: "brand" },
  idle: { label: "Idle", tone: "warning" },
  not_started: { label: "Not started", tone: "neutral" },
};

export const clientHealthMeta: Record<
  ClientSummary["health"],
  { label: string; tone: BadgeTone }
> = {
  healthy: { label: "Healthy", tone: "success" },
  watch: { label: "Watch", tone: "warning" },
  at_risk: { label: "At risk", tone: "danger" },
};

/**
 * Funding horizon → chip (Ticket D). `standard` has no chip (null) — only the
 * barbell ends earn a label so the card stays uncluttered.
 */
export const horizonMeta: Record<
  Horizon,
  { label: string; tone: BadgeTone } | null
> = {
  quick_win: { label: "Quick win", tone: "success" },
  strategic_bet: { label: "Strategic bet", tone: "brand" },
  standard: null,
};

/**
 * Delivery path → chip (Ticket C). `build` is the default/common path and gets
 * no chip; `buy` and `configure` earn a label since they're the trust signal.
 */
export const deliveryMeta: Record<
  DeliveryPath,
  { label: string; tone: BadgeTone } | null
> = {
  build: null,
  buy: { label: "Buy", tone: "warning" },
  configure: { label: "Configure", tone: "outline" },
};

/** Adoption-risk band → chip (Ticket E). */
export const adoptionRiskMeta: Record<
  "low" | "medium" | "high",
  { label: string; tone: BadgeTone }
> = {
  low: { label: "Low resistance", tone: "success" },
  medium: { label: "Some resistance", tone: "warning" },
  high: { label: "High resistance", tone: "danger" },
};

/** Systems-inventory category → chip (Ticket F). */
export const systemCategoryMeta: Record<
  "system" | "shadow_tool" | "integration_gap",
  { label: string; tone: BadgeTone }
> = {
  system: { label: "Official system", tone: "neutral" },
  shadow_tool: { label: "Shadow tool", tone: "warning" },
  integration_gap: { label: "Integration gap", tone: "danger" },
};

/** Stakeholder type → chip (Ticket B). */
export const stakeholderTypeMeta: Record<
  "decision_maker" | "blocker" | "adopter",
  { label: string; tone: BadgeTone }
> = {
  decision_maker: { label: "Decision-maker", tone: "brand" },
  blocker: { label: "Blocker", tone: "danger" },
  adopter: { label: "Adopter", tone: "neutral" },
};

/**
 * Tenant lifecycle status → badge. `status` is free text in the DB, so callers
 * fall back to `{ label: status, tone: "neutral" }` for anything unmapped.
 */
export const tenantStatusMeta: Record<
  string,
  { label: string; tone: BadgeTone }
> = {
  active: { label: "Active", tone: "success" },
  onboarding: { label: "Onboarding", tone: "brand" },
  paused: { label: "Paused", tone: "warning" },
  churned: { label: "Churned", tone: "neutral" },
};

export const captureKindTone: Record<CaptureKind, BadgeTone> = {
  bottleneck: "danger",
  workaround: "brand",
  tooling: "neutral",
  handoff: "warning",
  frustration: "warning",
  sop: "neutral",
  decision: "brand",
};

export const opportunityStatusMeta: Record<
  OpportunityStatus,
  { label: string; tone: BadgeTone }
> = {
  provisional: { label: "Provisional", tone: "neutral" },
  surfaced: { label: "Surfaced", tone: "brand" },
  hidden: { label: "Hidden", tone: "neutral" },
  approved: { label: "Approved", tone: "success" },
  deferred: { label: "Deferred", tone: "warning" },
  declined: { label: "Declined", tone: "neutral" },
};
