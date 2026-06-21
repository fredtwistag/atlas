/** The report's drillable sections — shared by the in-page anchors
 * (ReportArticle) and the drill-down sidebar registrar. ids match DOM anchor ids. */
export interface ReportSection {
  id: string;
  label: string;
}

export const REPORT_SECTIONS: ReportSection[] = [
  { id: "summary", label: "Summary" },
  { id: "findings", label: "What we found" },
  { id: "opportunities", label: "Opportunities" },
  { id: "roadmap", label: "Roadmap" },
];
