import { z } from "zod";

/** Capture extracted from a discovery reply. Validated before persistence. */
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
export type CaptureInput = z.infer<typeof CaptureSchema>;

/** Output of the extraction pass. */
export const ExtractionSchema = z.object({
  captures: z.array(CaptureSchema),
  notes_for_next_probe: z.string().nullable(),
});
export type ExtractionOutput = z.infer<typeof ExtractionSchema>;

/** Subset of opportunity fields an LLM proposes; full row adds scoring + ids. */
export const OpportunityCandidateSchema = z.object({
  title: z.string().min(8).max(120),
  description: z.string().min(20),
  category: z.string(),
  tags: z.array(z.string()).max(8),
});
export type OpportunityCandidate = z.infer<typeof OpportunityCandidateSchema>;

/** Manager launch-sprint form input. Validated in the server action + mutation. */
export const LaunchSprintSchema = z.object({
  name: z.string().min(3).max(120),
  primaryFocus: z.string().min(3).max(200),
  topicKeys: z.array(z.string()).min(1),
  participantIds: z.array(z.string().uuid()).min(1),
});
export type LaunchSprintInput = z.infer<typeof LaunchSprintSchema>;
