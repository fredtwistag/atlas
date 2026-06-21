// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useEffect } from "react";
import { buildPersonas, activePersona } from "./AppSidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/sprint/x/report" }));
vi.mock("@/app/sign-in/actions", () => ({ signOut: () => {} }));

describe("activePersona", () => {
  const personas = buildPersonas("sprint-1");

  it("always returns the Twistag persona for twistag users, regardless of path", () => {
    for (const path of [
      "/admin",
      "/admin/clients/abc",
      "/admin/clients/abc/sprint/s1/report",
      "/sprint/x/report",
      "/me",
      "/team",
    ]) {
      expect(activePersona(personas, path, "twistag").id).toBe("Twistag");
    }
  });

  it("selects the Manager persona for a tenant manager on /team", () => {
    expect(activePersona(personas, "/team", "tenant").id).toBe("Manager");
  });

  it("selects the IC persona for a tenant user on /me", () => {
    expect(activePersona(personas, "/me", "tenant").id).toBe("IC");
  });

  it("points the Twistag persona at the consolidated /admin routes", () => {
    const twistag = personas.find((p) => p.id === "Twistag")!;
    const items = twistag.groups.flatMap((g) => g.items);
    expect(items.find((i) => i.label === "All clients")?.href).toBe("/admin");
    expect(items.find((i) => i.label === "New client")?.href).toBe(
      "/admin/clients/new",
    );
  });
});

import { render, screen } from "@testing-library/react";
import { AppSidebar } from "./AppSidebar";
import { SidebarDrillProvider, useSidebarDrill, type SidebarDrillConfig } from "./SidebarDrillContext";

const drillConfig: SidebarDrillConfig = {
  backLabel: "Overview",
  backHref: "/sprint",
  title: "Report",
  sections: [{ id: "findings", label: "What we found" }, { id: "opportunities", label: "Opportunities" }],
  decision: { moneyLabel: "€190K+/yr", oppTitle: "Automate close", href: "/o/1", ctaLabel: "Approve →" },
};

function Seed({ config: c }: { config: SidebarDrillConfig | null }) {
  const { setConfig } = useSidebarDrill();
  useEffect(() => { setConfig(c); }, [c, setConfig]);
  return null;
}

const user = { name: "Vera", title: "Sponsor" };

describe("AppSidebar drill-down", () => {
  it("renders the drilled view (back, decision chip, section anchors) when a config is present", async () => {
    render(
      <SidebarDrillProvider>
        <Seed config={drillConfig} />
        <AppSidebar user={user} userKind="tenant" sprintId="x" />
      </SidebarDrillProvider>,
    );
    expect(await screen.findByText("What we found")).toBeTruthy(); // section anchor (waits for useEffect)
    expect(screen.getByText(/Overview/)).toBeTruthy(); // back label
    expect(screen.getByText("Automate close")).toBeTruthy(); // decision chip
    expect(screen.getByRole("link", { name: /Approve/ })).toBeTruthy();
    const anchor = screen.getByText("What we found").closest("a");
    expect(anchor?.getAttribute("href")).toBe("#findings");
  });
  it("renders the flat persona nav when no config is present", () => {
    render(
      <SidebarDrillProvider>
        <AppSidebar user={user} userKind="tenant" sprintId="x" />
      </SidebarDrillProvider>,
    );
    expect(screen.getByText("Participants")).toBeTruthy(); // flat manager nav
  });
});
