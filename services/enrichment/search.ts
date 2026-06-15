import { completeWithWebSearch } from "@/services/llm/client";
import {
  companyEnrichment,
  type CompanyEnrichment,
} from "@/services/llm/schemas";

/**
 * Company context enrichment via web search (CTX-2, ADR-004). Given a company
 * name + optional domain, search the public web and return a structured profile
 * shaped to the company_context columns, with sources cited.
 *
 * Public information only. The caller persists this as `draft` — CTX-4 only
 * injects `active` context, so nothing here reaches an IC until a human
 * reviews it.
 */

function enrichmentSystem(): string {
  return [
    "You research a company's PUBLIC profile to seed an operational discovery",
    "engagement. Use web search to find current, factual information.",
    "",
    "Produce a structured profile shaped to these fields:",
    "- summary: 2-3 sentences on what the business does.",
    "- industry, businessModel, sizeBand (e.g. '200-500 employees'),",
    "  revenueBand, maturity (e.g. 'PE-backed', 'Series B', 'bootstrapped').",
    "- keySystems: likely core systems/tools (ERP, CRM, etc.) IF stated or",
    "  strongly implied — do not guess wildly.",
    "- knownPains: operational pain areas the public record suggests.",
    "- sources: where each fact came from (label + url in ref).",
    "",
    "RULES:",
    "1. PUBLIC information only. Never include individuals' personal details.",
    "2. If you cannot find something, leave the field null / the array empty —",
    "   do NOT fabricate. An honest, sparse profile beats a confident wrong one.",
  ].join("\n");
}

export async function enrichCompanyContext(opts: {
  companyName: string;
  domain?: string | null;
}): Promise<CompanyEnrichment> {
  return completeWithWebSearch({
    system: enrichmentSystem(),
    schema: companyEnrichment,
    maxTokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          `COMPANY: ${opts.companyName}`,
          opts.domain ? `DOMAIN: ${opts.domain}` : "",
          "",
          "Search the web and return the structured public profile as JSON.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
}
