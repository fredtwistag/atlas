import { describe, it, expect } from "vitest";
import { extractDocumentText } from "./documents";

describe("extractDocumentText (CTX-3)", () => {
  it("decodes text-based formats from a string", () => {
    expect(extractDocumentText("text/markdown", "  # Ops manual  ")).toBe(
      "# Ops manual",
    );
    expect(extractDocumentText("text/csv", "a,b\n1,2")).toBe("a,b\n1,2");
    expect(extractDocumentText("application/json", '{"x":1}')).toBe('{"x":1}');
  });

  it("decodes text from bytes", () => {
    const bytes = new TextEncoder().encode("hello world");
    expect(extractDocumentText("text/plain", bytes)).toBe("hello world");
  });

  it("returns null for binary formats we don't parse yet (PDF/DOCX)", () => {
    expect(extractDocumentText("application/pdf", "%PDF-1.7...")).toBeNull();
    expect(
      extractDocumentText(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "binary",
      ),
    ).toBeNull();
  });

  it("returns null for empty/whitespace-only text", () => {
    expect(extractDocumentText("text/plain", "   \n  ")).toBeNull();
  });
});
