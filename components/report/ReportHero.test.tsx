// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportHero } from "./ReportHero";
import type { Sprint, SprintProgress, Opportunity } from "@/lib/types";

const sprint = { tenantName: "Vizta", name: "Q2", tenantDomain: null, primaryFocus: "ops", scopeDepartment: "Ops", tenantCurrency: "EUR", sponsor: { name: "Vera", title: "Admin" } } as unknown as Sprint;
const progress = { opportunitiesCount: 9, highImpactCount: 3, capturesCount: 46, sessionsCompleted: 3, participantCount: 3, completionPct: 100 } as unknown as SprintProgress;
const opp = (id: string, impactLow: number, impactHigh: number, title: string) =>
  ({ id, impactLow, impactHigh, title, timeToShipWeeksLow: 4, timeToShipWeeksHigh: 6, contributorCount: 7 }) as unknown as Opportunity;
const opps = [opp("o1", 56000, 75000, "Automate quantity-map ingestion"), opp("o2", 36000, 54000, "B")];

describe("ReportHero", () => {
  it("renders the headline and the top opportunity as the recommended move", () => {
    render(<ReportHero sprint={sprint} progress={progress} opps={opps} currency="EUR" />);
    expect(screen.getByText(/recoverable/i)).toBeTruthy();
    expect(screen.getByText(/Automate quantity-map ingestion/)).toBeTruthy();
  });
  it("shows an Approve CTA labeled for a sponsor only when a link + sponsor are given", () => {
    const { rerender } = render(<ReportHero sprint={sprint} progress={progress} opps={opps} currency="EUR" opportunityHref={(id) => `/o/${id}`} isSponsor />);
    expect(screen.getByRole("link", { name: /approve/i })).toBeTruthy();
    rerender(<ReportHero sprint={sprint} progress={progress} opps={opps} currency="EUR" opportunityHref={(id) => `/o/${id}`} isSponsor={false} />);
    expect(screen.queryByRole("link", { name: /approve/i })).toBeNull();
    expect(screen.getByRole("link", { name: /review/i })).toBeTruthy();
  });
});
