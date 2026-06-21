import type { WorkflowGraphDraft } from "@/services/llm/schemas";

/**
 * A capture as the workflow engine sees it. `role` + `department` are sent to
 * the LLM (no names). `contributorId` is SERVER-ONLY — used for corroboration
 * scoring; it is NEVER included in any LLM prompt.
 */
export interface WorkflowCapture {
  id: string; // capture uuid
  kind: string;
  summary: string;
  role: string;
  department: string | null;
  contributorId: string; // server-only — never sent to the model
}

/** Minimal opportunity shape for the impact/effort matrix. */
export interface OpportunityPoint {
  id: string;
  title: string;
  impactHigh: number;
  timeToShipWeeksHigh: number;
  horizon: string;
}

export interface WorkflowConfidence {
  score: number; // 0–1, computed (never model self-report)
  coverage: number; // 0–1
  corroboratedCount: number;
  disputedStepIds: string[];
}

/** The stored graph: an LLM draft (or pure-TS build) plus server-added fields. */
export interface WorkflowGraph extends WorkflowGraphDraft {
  confidence: WorkflowConfidence;
  modelVersion: string;
}
