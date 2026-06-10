import { describe, it, expect } from "vitest";
import { managerChecklist, headsUpTemplate } from "./onboarding";

const BANNED = [
  "leverage",
  "unlock",
  "seamless",
  "robust",
  "empower",
  "game-changer",
  "cutting-edge",
];

describe("managerChecklist", () => {
  it("always returns the three ordered steps", () => {
    const steps = managerChecklist({ memberCount: 0, hasSprint: false });
    expect(steps.map((s) => s.title)).toEqual([
      "Invite your team",
      "Send the heads-up message",
      "Launch your sprint",
    ]);
  });

  it("marks 'Invite your team' done once there are members", () => {
    expect(managerChecklist({ memberCount: 0, hasSprint: false })[0].done).toBe(
      false,
    );
    expect(managerChecklist({ memberCount: 3, hasSprint: false })[0].done).toBe(
      true,
    );
  });

  it("marks 'Launch your sprint' done once a sprint exists", () => {
    expect(managerChecklist({ memberCount: 3, hasSprint: false })[2].done).toBe(
      false,
    );
    expect(managerChecklist({ memberCount: 3, hasSprint: true })[2].done).toBe(
      true,
    );
  });
});

describe("headsUpTemplate", () => {
  it("covers the commitment, privacy, and the code we actually send", () => {
    const msg = headsUpTemplate();
    expect(msg).toContain("4 short questions");
    expect(msg).toContain("about 5 minutes");
    expect(msg).toContain("7 days");
    expect(msg).toContain("6-digit code");
    expect(msg).not.toContain("magic link");
  });

  it("uses no banned style-guide words", () => {
    const lower = headsUpTemplate().toLowerCase();
    for (const word of BANNED) {
      expect(lower).not.toContain(word);
    }
  });
});
