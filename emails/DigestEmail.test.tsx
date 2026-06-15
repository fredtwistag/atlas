import { render } from "@react-email/render";
import { describe, it, expect } from "vitest";
import { DigestEmail } from "./DigestEmail";

const BANNED = [
  "leverage",
  "unlock",
  "seamless",
  "robust",
  "empower",
  "game-changer",
  "cutting-edge",
];

const base = {
  orgName: "Northwind",
  sprintName: "Ops Discovery",
  participationPct: 60,
  capturesCount: 24,
  opportunitiesCount: 7,
  topOpportunities: [
    { title: "Kill the manual quote re-key", score: 9 },
    { title: "Consolidate the approval gate", score: 8 },
    { title: "Automate the weekly export", score: 6 },
  ],
  ctaUrl: "https://atlas.test/report",
};

describe("DigestEmail", () => {
  it("renders the sponsor digest with dashboard numbers, top-3, and CTA", async () => {
    const html = await render(<DigestEmail audience="sponsor" {...base} />);

    // The aggregates (must match the dashboard's loadSprintProgress output).
    expect(html).toContain("60%");
    expect(html).toContain("24");
    expect(html).toContain("7");
    // Top-3 by composite, ranked.
    expect(html).toContain("Kill the manual quote re-key");
    expect(html).toContain("Consolidate the approval gate");
    expect(html).toContain("Automate the weekly export");
    expect(html).toContain("View the report");
    expect(html).toContain("https://atlas.test/report");
    // Privacy promise mirrors NudgeEmail.
    expect(html).toContain(
      "Atlas digests show aggregates and opportunity titles only",
    );

    const lower = html.toLowerCase();
    for (const word of BANNED) expect(lower).not.toContain(word);
  });

  it("renders the manager digest with the dashboard CTA", async () => {
    const html = await render(
      <DigestEmail audience="manager" {...base} ctaUrl="https://atlas.test/" />,
    );
    expect(html).toContain("Open the dashboard");
    expect(html).toContain("Ops Discovery");
  });

  it("omits the top-opportunities block when there are none", async () => {
    const html = await render(
      <DigestEmail
        audience="manager"
        {...base}
        opportunitiesCount={0}
        topOpportunities={[]}
        ctaUrl="https://atlas.test/"
      />,
    );
    expect(html).not.toContain("Top opportunities by impact");
  });

  it("singularizes capture/opportunity counts of one", async () => {
    const html = await render(
      <DigestEmail
        audience="sponsor"
        {...base}
        capturesCount={1}
        opportunitiesCount={1}
        topOpportunities={[{ title: "One thing", score: 5 }]}
      />,
    );
    // React Email injects `<!-- -->` markers between interpolated nodes, so
    // strip HTML comments + collapse whitespace before asserting the wording.
    const text = html.replace(/<!--.*?-->/g, "").replace(/\s+/g, " ");
    expect(text).toContain("1 capture recorded");
    expect(text).toContain("1 opportunity surfaced");
    expect(text).not.toContain("captures recorded");
    expect(text).not.toContain("opportunities surfaced");
  });
});
