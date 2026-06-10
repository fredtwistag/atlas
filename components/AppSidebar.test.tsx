import { describe, it, expect } from "vitest";
import { buildPersonas, activePersona } from "./AppSidebar";

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
