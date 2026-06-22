import { z } from "zod";

/**
 * Zod schemas for structured LLM outputs. CLAUDE.md: "Zod schemas for every API
 * input AND every LLM output (validate before use)." `completeStructured` in
 * ./client.ts runs the model's JSON through one of these before any caller sees
 * it.
 *
 * The capture schema mirrors docs/03-conversational-engine.md §6. Plan 014 owns
 * the extraction pass that produces these; it lives here so the LLM layer has a
 * single home for output contracts and 014 imports rather than redefining.
 */
export const CaptureSchema = z.object({
  kind: z.enum([
    "bottleneck",
    "workaround",
    "tooling",
    "handoff",
    "frustration",
    "sop",
    "decision",
  ]),
  summary: z.string().min(15).max(280),
  source_quote: z.string(),
  tags: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
});

export type Capture = z.infer<typeof CaptureSchema>;

/**
 * The extraction pass returns zero or more captures for a single user turn.
 * Wrapped in an object so the model returns a JSON object (more reliable than a
 * bare top-level array across models).
 */
export const ExtractionResultSchema = z.object({
  captures: z.array(CaptureSchema),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/**
 * Plan 014's extraction contract. This is the schema the extraction pass
 * (services/conversation/extract.ts) actually validates against — distinct from
 * the docs/03 mirror above so the wire shape matches the `captures` table
 * (`sourceQuote`, no `confidence`) and the takeTurn return shape that plan 015
 * renders. Kinds are the canonical set shared by db/schema.ts, lib/ui-maps.ts
 * (captureKindTone), and docs/03 §6 — keep all four in lockstep.
 *
 * `summary.min(8)` is intentionally looser than docs/03's 15 so terse-but-real
 * captures ("AE re-keys the quote") survive; the substring guard in extract.ts
 * is the quality gate that drops fabricated quotes.
 */
/**
 * Optional quantified impact for a capture (EXT-2). The extractor fills any
 * subset the contributor actually stated — frequency, time per occurrence,
 * and/or a direct dollar cost — plus a short `basis` recording their words.
 * Scoring (services/opportunity/score.ts) turns this into a real annual-dollar
 * figure (frequency × cost-per-incident) instead of inferring an unstated
 * salary. All fields are nullable; the whole object is null when the
 * contributor gave no numbers (the common case).
 */
export const quantifiedImpact = z.object({
  frequencyPerYear: z
    .number()
    .positive()
    .max(1_000_000)
    .nullable()
    .default(null),
  unitMinutes: z.number().positive().max(100_000).nullable().default(null),
  unitCostUsd: z.number().positive().max(10_000_000).nullable().default(null),
  basis: z.string().max(200).nullable().default(null),
});

export type QuantifiedImpact = z.infer<typeof quantifiedImpact>;

export const capturedItem = z.object({
  kind: z.enum([
    "bottleneck",
    "workaround",
    "tooling",
    "handoff",
    "frustration",
    "sop",
    "decision",
  ]),
  summary: z.string().min(8).max(280),
  sourceQuote: z.string().min(3),
  tags: z.array(z.string()).max(5).default([]),
  quantifiedImpact: quantifiedImpact.nullable().optional(),
});

export type CapturedItem = z.infer<typeof capturedItem>;

/** A single extraction pass yields up to 4 captures (object-wrapped for model reliability). */
export const captureExtraction = z.object({
  captures: z.array(capturedItem).max(4),
});

export type CaptureExtraction = z.infer<typeof captureExtraction>;

/* ------------------------------------------------------------------------- *
 * Plan 016 — opportunity engine output contracts.
 *
 * Two LLM passes feed services/opportunity/*: clustering (group a sprint's
 * captures into candidate themes) and scoring (turn one cluster into a scored,
 * rationale-backed opportunity). Both validate here so the LLM layer owns every
 * output shape. Privacy (CLAUDE.md): NOTHING in these schemas carries a user
 * name — only capture ids, kinds, summaries, quotes, roles, departments.
 * ------------------------------------------------------------------------- */

/**
 * One clustered theme: a human-readable theme name and the capture ids it
 * groups. `.min(2)` enforces the rubric's "singleton-drop" rule — a theme
 * needs corroboration from at least two captures to be a candidate opportunity.
 */
export const captureCluster = z.object({
  theme: z.string().min(3).max(120),
  captureIds: z.array(z.string().uuid()).min(2),
});

export type CaptureCluster = z.infer<typeof captureCluster>;

/** Object-wrapped array of clusters (object root is more reliable across models). */
export const clusterResult = z.object({
  clusters: z.array(captureCluster),
});

export type ClusterResult = z.infer<typeof clusterResult>;

/**
 * The five rubric dimensions (prompts/scoring-rubric.md). Keys are stable and
 * drive the composite weights in services/opportunity/score.ts — the LLM emits
 * the 0-10 scores + reasoning, TypeScript does the weighted arithmetic.
 */
export const DIMENSION_KEYS = [
  "financial",
  "time_to_ship",
  "ai_suitability",
  "change_mgmt",
  "dependency",
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

const dimensionScore = z.object({
  key: z.enum(DIMENSION_KEYS),
  score: z.number().min(0).max(10),
  reasoning: z.string().min(1).max(400),
});

/**
 * The scorer prompt lists the five dimensions by name, so the model sometimes
 * emits `dimensionScores` as an OBJECT keyed by dimension
 * (`{ financial: { score, reasoning }, … }`) instead of the array the schema
 * wants — a shape quirk that hard-failed the whole recompute. Normalize the
 * object form into the `[{ key, score, reasoning }]` array before validation;
 * pass arrays (and anything else) through untouched so Zod still reports real
 * problems. A numeric value (`{ financial: 8 }`) becomes `{ key, score }`.
 */
function normalizeDimensionScores(val: unknown): unknown {
  if (!val || typeof val !== "object" || Array.isArray(val)) return val;
  return Object.entries(val as Record<string, unknown>).map(([key, v]) =>
    v && typeof v === "object" ? { key, ...(v as object) } : { key, score: v },
  );
}

/**
 * One scored opportunity. Mirrors the `opportunities` columns the engine writes,
 * EXCEPT `compositeScore` — that is computed in TS from `dimensionScores` (the
 * model is bad at weighted arithmetic, and the plan forbids letting it try).
 * `evidenceCaptureIds` records which of the cluster's captures actually drove
 * the score so persistence can link evidence precisely.
 */
export const opportunityScoring = z
  .object({
    title: z.string().min(5).max(140),
    description: z.string().min(20).max(600),
    category: z.string().min(2).max(60),
    departments: z.array(z.string().min(1).max(60)).max(6).default([]),
    impactLow: z.number().int().min(0),
    impactHigh: z.number().int().min(0),
    timeToShipWeeksLow: z.number().int().min(1).max(52),
    timeToShipWeeksHigh: z.number().int().min(1).max(52),
    confidenceScore: z.number().int().min(1).max(5),
    dimensionScores: z.preprocess(
      normalizeDimensionScores,
      z
        .array(dimensionScore)
        .length(DIMENSION_KEYS.length)
        // exactly one entry per dimension key, no dupes, no omissions
        .refine(
          (arr) =>
            new Set(arr.map((d) => d.key)).size === DIMENSION_KEYS.length,
          {
            message:
              "dimensionScores must cover each of the 5 keys exactly once",
          },
        ),
    ),
    rationale: z.string().min(40).max(1600),
    // Capability-gap / delivery path (Ticket C): honestly say build vs buy vs
    // configure so the report doesn't manufacture build work.
    delivery: z.enum(["build", "buy", "configure"]),
    deliveryRationale: z.string().min(10).max(400),
    evidenceCaptureIds: z.array(z.string().uuid()).min(1),
  })
  .refine((o) => o.impactLow <= o.impactHigh, {
    message: "impactLow must be <= impactHigh",
    path: ["impactHigh"],
  })
  .refine((o) => o.timeToShipWeeksLow <= o.timeToShipWeeksHigh, {
    message: "timeToShipWeeksLow must be <= timeToShipWeeksHigh",
    path: ["timeToShipWeeksHigh"],
  });

export type OpportunityScoring = z.infer<typeof opportunityScoring>;

/**
 * Pilot-portfolio narrative (Ticket A): the prose that frames why these 3-5
 * opportunities, why now, and how they sequence into an operating-model move.
 * The SELECTION is done in TS (services/synthesis/portfolio.ts) — the model
 * only writes the paragraph. No individual names.
 */
export const portfolioNarrative = z.object({
  narrative: z.string().min(40).max(2000),
});

export type PortfolioNarrative = z.infer<typeof portfolioNarrative>;

/**
 * Current-state systems inventory (Ticket F): cluster `tooling` + `workaround`
 * captures into named systems, each categorized as an official `system`, an
 * unofficial `shadow_tool`, or a missing `integration_gap`.
 */
export const systemInventoryItem = z.object({
  name: z.string().min(2).max(80),
  category: z.enum(["system", "shadow_tool", "integration_gap"]),
  summary: z.string().min(10).max(400),
  captureIds: z.array(z.string().uuid()).min(1),
});

export const systemsInventory = z.object({
  items: z.array(systemInventoryItem),
});

export type SystemsInventory = z.infer<typeof systemsInventory>;
export type SystemInventoryItem = z.infer<typeof systemInventoryItem>;

/**
 * Stakeholder map (Ticket B): from decision/handoff captures + the roster,
 * role-level stakeholders typed decision_maker / blocker / adopter, each with
 * the opportunities they gate. ROLE LABELS ONLY — never an individual name.
 */
export const stakeholder = z.object({
  roleLabel: z.string().min(2).max(80),
  department: z.string().max(80).nullable().default(null),
  type: z.enum(["decision_maker", "blocker", "adopter"]),
  summary: z.string().min(10).max(400),
  gatedOpportunityIds: z.array(z.string().uuid()).default([]),
});

export const stakeholderMap = z.object({
  stakeholders: z.array(stakeholder),
});

export type StakeholderMap = z.infer<typeof stakeholderMap>;
export type Stakeholder = z.infer<typeof stakeholder>;

/**
 * Board-ready synthesis memo (Ticket G): the connective narrative that packages
 * the portfolio (A), stakeholder approvals (B), and adoption risks (E) into a
 * sequenced operating-model story. Generated once at sprint close, cached. No
 * marketing-speak, no individual names.
 */
export const synthesisMemo = z.object({
  openingNarrative: z.string().min(20).max(1200),
  portfolioStory: z.string().min(20).max(1200),
  sequencingLogic: z.string().min(20).max(1200),
  riskNarrative: z.string().min(20).max(1200),
  recommendedNextStep: z.string().min(10).max(600),
});

export type SynthesisMemo = z.infer<typeof synthesisMemo>;

/**
 * Web-search enrichment (CTX-2) is advisory data a human reviews before it goes
 * `active`, and Claude's web-search replies are shape-variable: it sometimes
 * returns an object (e.g. `{name: "SAP"}`) where we store plain text, or a
 * string longer than expected. Coerce each value to a trimmed string and clamp
 * its length, so a shape/length quirk seeds a slightly-off draft instead of
 * hard-failing the whole enrichment. The DB columns are unbounded `text` /
 * `text[]` (migration 0011), so the caps here are sanity guards, not storage
 * limits.
 */
function looseText(maxLen: number) {
  return z.preprocess((v) => {
    if (v == null) return v;
    let s: string;
    if (typeof v === "string") s = v;
    else if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      const pick = o.name ?? o.system ?? o.label ?? o.title ?? o.value;
      s = typeof pick === "string" ? pick : JSON.stringify(v);
    } else {
      s = String(v);
    }
    s = s.trim();
    return s.length > maxLen ? s.slice(0, maxLen) : s;
  }, z.string());
}

/** A string array that tolerates object entries and nullish input (→ []). */
function looseStringArray(maxLen: number, maxItems: number) {
  return z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => x != null) : (v ?? [])),
    z.array(looseText(maxLen)).max(maxItems),
  );
}

/**
 * Company enrichment output (CTX-2): the structured public profile produced by
 * the web-search enrichment, shaped to the company_context columns. `sources`
 * cites where each fact came from. Public info only — no individuals.
 */
export const companyEnrichment = z.object({
  summary: looseText(600).nullable().default(null),
  industry: looseText(120).nullable().default(null),
  businessModel: looseText(160).nullable().default(null),
  sizeBand: looseText(120).nullable().default(null),
  revenueBand: looseText(120).nullable().default(null),
  maturity: looseText(120).nullable().default(null),
  keySystems: looseStringArray(120, 20).default([]),
  knownPains: looseStringArray(200, 20).default([]),
  sources: z
    .array(
      z.object({
        label: looseText(160),
        ref: looseText(400).nullable().default(null),
      }),
    )
    .max(20)
    .default([]),
});

export type CompanyEnrichment = z.infer<typeof companyEnrichment>;

/**
 * Workflow diagram graph (Plan 1). The LLM emits SEMANTIC STRUCTURE ONLY —
 * lanes/steps/edges, each citing captureIds (uuids). Internal graph ids
 * (step/lane/edge `id`, `from`, `to`) are short strings the model chooses, NOT
 * uuids. `confidence` and `modelVersion` are added server-side, not by the LLM.
 * NEVER contains names or contributor ids.
 */
export const workflowKind = z.enum([
  "swimlane",
  "before_after",
  "systems_topology",
  "impact_effort",
  "decision_flow",
  "handoff_network",
  "rework_loop",
  "journey_map",
  "raci_grid",
  "sipoc_strip",
]);

export const workflowLane = z.object({
  id: z.string().min(1).max(40),
  roleLabel: z.string().min(1).max(80),
  department: z.string().max(80).nullable().default(null),
});

export const workflowStep = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  laneId: z.string().max(40).nullable().default(null),
  stepKind: z.enum([
    "step",
    "bottleneck",
    "decision",
    "system",
    "shadow_tool",
    "gap",
    "start",
    "end",
  ]),
  inferred: z.boolean().default(false),
  captureIds: z.array(z.string().uuid()).default([]),
  // Set only for kind = 'impact_effort' (effort=x, impact=y). LLM leaves null.
  metric: z
    .object({ x: z.number(), y: z.number() })
    .nullable()
    .default(null),
  // Render-only: a one-line description attached at read time from the step's
  // evidence (see loadOpportunityWorkflow). The LLM never sets this — it's not
  // in any generation prompt; the read layer always overwrites it.
  detail: z.string().nullable().optional(),
});

export const workflowEdge = z.object({
  id: z.string().min(1).max(40),
  from: z.string().min(1).max(40),
  to: z.string().min(1).max(40),
  edgeKind: z.enum(["flow", "handoff", "gap"]),
  label: z.string().max(40).nullable().default(null),
  inferred: z.boolean().default(false),
  captureIds: z.array(z.string().uuid()).default([]),
});

export const workflowGraphDraft = z.object({
  kind: workflowKind,
  title: z.string().min(2).max(120),
  lanes: z.array(workflowLane).default([]),
  steps: z.array(workflowStep).min(1),
  edges: z.array(workflowEdge).default([]),
});

export const workflowCritique = z.object({
  unsupportedStepIds: z.array(z.string().max(40)).default([]),
  unsupportedEdgeIds: z.array(z.string().max(40)).default([]),
});

export type WorkflowKind = z.infer<typeof workflowKind>;
export type WorkflowLane = z.infer<typeof workflowLane>;
export type WorkflowStep = z.infer<typeof workflowStep>;
export type WorkflowEdge = z.infer<typeof workflowEdge>;
export type WorkflowGraphDraft = z.infer<typeof workflowGraphDraft>;
export type WorkflowCritique = z.infer<typeof workflowCritique>;
