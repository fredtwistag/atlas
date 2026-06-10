import { render } from "@react-email/render";
import { describe, it, expect } from "vitest";
import { InviteEmail, inviteSubject } from "./InviteEmail";

// CLAUDE.md style guide — none of these may ever appear in user-facing copy.
const BANNED = [
  "leverage",
  "unlock",
  "seamless",
  "robust",
  "empower",
  "game-changer",
  "cutting-edge",
];

const CONFIRM_URL = "https://atlas.test/auth/confirm?token_hash=tok_abc123";

function expectNoBannedWords(html: string) {
  const lower = html.toLowerCase();
  for (const word of BANNED) {
    expect(lower).not.toContain(word);
  }
}

describe("InviteEmail", () => {
  it("IC variant: time estimate, privacy promise, topic preview, confirm CTA", async () => {
    const html = await render(
      <InviteEmail
        role="ic"
        orgName="Northwind"
        inviterName="Marcus"
        confirmUrl={CONFIRM_URL}
        topics={[
          { title: "How work flows", estMinutes: 6 },
          { title: "One change", estMinutes: 4 },
        ]}
      />,
    );

    expect(html).toContain(CONFIRM_URL);
    expect(html).toContain("Open Atlas");
    // Time estimate.
    expect(html).toContain("about 5 minutes");
    // Privacy promise, verbatim from /me.
    expect(html).toContain("attributed by role, never by name");
    expect(html).toContain("7 days");
    // Topic preview.
    expect(html).toContain("How work flows");
    expect(html).toContain("about 6 min");
    expectNoBannedWords(html);
  });

  it("IC subject names the inviter and the time commitment", () => {
    expect(inviteSubject("ic", "Marcus", "Northwind")).toBe(
      "Marcus added you to Atlas — 4 short conversations, ~5 minutes each",
    );
  });

  it("Sponsor variant: calibration line, approval explanation, report CTA", async () => {
    const html = await render(
      <InviteEmail
        role="sponsor"
        orgName="Northwind"
        inviterName="Marcus"
        confirmUrl={CONFIRM_URL}
      />,
    );

    expect(html).toContain(CONFIRM_URL);
    expect(html).toContain("View the report");
    expect(html).toContain("5-10 opportunities surfaced, 1-3");
    expect(html).toContain("Twistag engagement team");
    expect(inviteSubject("sponsor", "Marcus", "Northwind")).toBe(
      "You're the sponsor for Northwind's discovery sprint",
    );
    expectNoBannedWords(html);
  });

  it("Manager variant: 1-2-3 first steps and setup CTA", async () => {
    const html = await render(
      <InviteEmail
        role="manager"
        orgName="Northwind"
        inviterName="The Atlas team"
        confirmUrl={CONFIRM_URL}
      />,
    );

    expect(html).toContain(CONFIRM_URL);
    expect(html).toContain("Set up your sprint");
    expect(html).toContain("Invite your team");
    expect(html).toContain("heads-up message");
    expect(html).toContain("Launch your sprint");
    expect(inviteSubject("manager", "Marcus", "Northwind")).toBe(
      "Your Atlas workspace for Northwind is ready",
    );
    expectNoBannedWords(html);
  });
});
