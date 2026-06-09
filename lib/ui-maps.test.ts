import { describe, it, expect } from "vitest";
import {
  participantStatusMeta,
  captureKindTone,
  clientHealthMeta,
} from "./ui-maps";

describe("ui-maps", () => {
  it("maps every participant status to a label + tone", () => {
    expect(participantStatusMeta.idle).toEqual({
      label: "Idle",
      tone: "warning",
    });
    expect(participantStatusMeta.completed.tone).toBe("success");
  });

  it("maps capture kinds to tones", () => {
    expect(captureKindTone.bottleneck).toBe("danger");
    expect(captureKindTone.handoff).toBe("warning");
  });

  it("maps client health to a tone", () => {
    expect(clientHealthMeta.at_risk.tone).toBe("danger");
  });
});
