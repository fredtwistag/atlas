import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpportunityDetail } from "@/components/opportunity/OpportunityDetail";
import { db, sowDraftFor } from "@/lib/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; oppId: string }>;
}): Promise<Metadata> {
  const { oppId } = await params;
  const opp = await db.opportunity.get(oppId);
  return { title: opp ? `${opp.title} · Atlas` : "Opportunity · Atlas" };
}

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ id: string; oppId: string }>;
}) {
  const { id, oppId } = await params;
  const opp = await db.opportunity.get(oppId);
  if (!opp) notFound();

  return <OpportunityDetail sprintId={id} opp={opp} sow={sowDraftFor(opp)} />;
}
