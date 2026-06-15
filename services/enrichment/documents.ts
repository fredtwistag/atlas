import { completeStructured } from "@/services/llm/client";
import {
  companyEnrichment,
  type CompanyEnrichment,
} from "@/services/llm/schemas";

/**
 * Artifact ingestion (CTX-3): turn an uploaded document into company context.
 *
 * Text extraction is dep-free for text-based formats (txt/md/csv/json/html).
 * Binary formats (PDF/DOCX) return null here — wiring a parser (pdf/mammoth) is
 * a follow-up so this stays CI-safe and dependency-light. The summarize step
 * reuses the CTX-2 company-profile shape, producing a DRAFT profile (CTX-4 only
 * injects `active`, so an uploaded doc never reaches an IC unreviewed).
 */

const TEXT_MIME = /^(text\/|application\/(json|xml|csv|markdown))/i;

/**
 * Decode a document's text when the format is text-based. Returns null for
 * binary formats we don't yet parse (PDF/DOCX) — the caller records the
 * document but skips summarization.
 */
export function extractDocumentText(
  mimeType: string,
  content: string | Uint8Array,
): string | null {
  if (!TEXT_MIME.test(mimeType)) return null;
  const text =
    typeof content === "string"
      ? content
      : new TextDecoder("utf-8").decode(content);
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function summarizeSystem(): string {
  return [
    "You read an internal document a client shared and extract a company profile",
    "shaped to these fields: summary, industry, businessModel, sizeBand,",
    "revenueBand, maturity, keySystems[], knownPains[], sources[].",
    "",
    "RULES:",
    "1. Use ONLY what the document supports. Leave fields null / arrays empty",
    "   rather than guessing. Do not fabricate.",
    "2. No individuals' personal details.",
    "3. sources: cite the document (label = the filename given).",
  ].join("\n");
}

/**
 * Summarize extracted document text into the company-profile shape. Caps the
 * text fed to the model to bound cost. Returns the validated profile (draft).
 */
export async function summarizeDocumentIntoContext(opts: {
  filename: string;
  text: string;
}): Promise<CompanyEnrichment> {
  const clipped = opts.text.slice(0, 16_000);
  return completeStructured({
    system: summarizeSystem(),
    schema: companyEnrichment,
    maxTokens: 1500,
    messages: [
      {
        role: "user",
        content: `DOCUMENT: ${opts.filename}\n\n${clipped}`,
      },
    ],
  });
}
