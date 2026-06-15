import { Section } from "@react-email/components";
import {
  EmailLayout,
  EmailHeading,
  EmailText,
  EmailButton,
} from "./components/EmailLayout";

export type DigestAudience = "sponsor" | "manager";

export interface DigestTopOpportunity {
  title: string;
  /** Composite score, already rounded for display. */
  score: number;
}

export interface DigestEmailProps {
  audience: DigestAudience;
  orgName: string;
  sprintName: string;
  /** Participation %, whole number (matches the dashboard stat strip). */
  participationPct: number;
  /** Captures recorded this sprint so far ("WAC" on the dashboard). */
  capturesCount: number;
  /** Opportunities surfaced so far. */
  opportunitiesCount: number;
  /** Up to three highest-composite opportunities. */
  topOpportunities: DigestTopOpportunity[];
  /** CTA target — the report (sponsor) or the dashboard (manager). */
  ctaUrl: string;
}

const statRow = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#09090b",
  margin: "0 0 6px",
};

const oppRow = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#09090b",
  margin: "0 0 6px",
};

function ctaLabel(audience: DigestAudience): string {
  return audience === "sponsor" ? "View the report" : "Open the dashboard";
}

/**
 * The weekly sprint digest (plan 020, Step 5). One template, `audience` selects
 * the framing and CTA. All numbers come from `lib/sprint-read.ts`
 * (`loadSprintProgress`) — the SAME source the dashboard reads, so the digest
 * and the dashboard never disagree.
 *
 * Privacy: aggregates + opportunity titles only. No contributor names, no quotes
 * — the footer states it, mirroring NudgeEmail.
 */
export function DigestEmail(props: DigestEmailProps) {
  const {
    audience,
    orgName,
    sprintName,
    participationPct,
    capturesCount,
    opportunitiesCount,
    topOpportunities,
    ctaUrl,
  } = props;

  const heading =
    audience === "sponsor"
      ? `This week on ${orgName}'s discovery sprint`
      : `Your sprint this week — ${sprintName}`;

  return (
    <EmailLayout
      preview={`${sprintName}: ${participationPct}% participation, ${opportunitiesCount} opportunities so far`}
      footer="Atlas digests show aggregates and opportunity titles only — never names or quotes."
    >
      <EmailHeading>{heading}</EmailHeading>
      <EmailText>
        A quick read on where {sprintName} stands. Open Atlas for the full,
        click-through detail.
      </EmailText>

      <Section style={{ margin: "0 0 16px" }}>
        <p style={statRow}>{participationPct}% of the team has taken part</p>
        <p style={statRow}>
          {capturesCount} {capturesCount === 1 ? "capture" : "captures"}{" "}
          recorded so far
        </p>
        <p style={statRow}>
          {opportunitiesCount}{" "}
          {opportunitiesCount === 1 ? "opportunity" : "opportunities"} surfaced
        </p>
      </Section>

      {topOpportunities.length > 0 && (
        <Section style={{ margin: "0 0 16px" }}>
          <EmailText muted>Top opportunities by impact:</EmailText>
          {topOpportunities.map((o, i) => (
            <p key={i} style={oppRow}>
              {`${i + 1}. ${o.title} — score ${o.score}`}
            </p>
          ))}
        </Section>
      )}

      <EmailButton href={ctaUrl}>{ctaLabel(audience)}</EmailButton>
    </EmailLayout>
  );
}
