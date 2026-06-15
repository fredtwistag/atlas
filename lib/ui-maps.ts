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
