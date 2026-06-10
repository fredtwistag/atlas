import { render } from "@react-email/render";
import { describe, it, expect } from "vitest";
import { NudgeEmail } from "./NudgeEmail";

const BANNED = [
  "leverage",
  "unlock",
  "seamless",
  "robust",
  "empower",
  "game-changer",
  "cutting-edge",
];

describe("NudgeEmail", () => {
  it("renders the manager's body, attribution, CTA, and privacy footer", async () => {
    const html = await render(
      <NudgeEmail
        senderName="Marcus"
        orgName="Northwind"
        body={"Hi Sam,\n\nJust a nudge — your sessions are open whenever.\n\nThanks!"}
        ctaUrl="https://atlas.test/me"
      />,
    );

    expect(html).toContain("Hi Sam,");
    expect(html).toContain("your sessions are open whenever");
    expect(html).toContain("Thanks!");
    expect(html).toContain("Marcus");
    expect(html).toContain("Northwind");
    expect(html).toContain("Open your sessions");
    expect(html).toContain("https://atlas.test/me");
    // Privacy promise the IC sees in every nudge.
    expect(html).toContain(
      "Atlas never includes what you said in emails to your manager",
    );

    const lower = html.toLowerCase();
    for (const word of BANNED) {
      expect(lower).not.toContain(word);
    }
  });
});
