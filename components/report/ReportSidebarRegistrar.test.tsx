// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarDrillProvider, useSidebarDrill } from "@/components/SidebarDrillContext";
import { ReportSidebarRegistrar } from "./ReportSidebarRegistrar";
import { REPORT_SECTIONS } from "@/lib/report-sections";

function Peek() {
  const { config } = useSidebarDrill();
  return <span data-testid="peek">{config ? `${config.title}:${config.sections.length}:${config.decision?.ctaLabel ?? "-"}` : "none"}</span>;
}

describe("ReportSidebarRegistrar", () => {
  it("registers the report drill config (title, sections, decision) into the context", () => {
    render(
      <SidebarDrillProvider>
        <ReportSidebarRegistrar
          config={{ backLabel: "Overview", backHref: "/sprint", title: "Report", sections: REPORT_SECTIONS, decision: { moneyLabel: "€190K+/yr", oppTitle: "Top move", href: "/o/1", ctaLabel: "Approve →" } }}
        />
        <Peek />
      </SidebarDrillProvider>,
    );
    expect(screen.getByTestId("peek").textContent).toBe("Report:4:Approve →");
  });
});
