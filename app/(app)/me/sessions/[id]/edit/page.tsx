import { notFound } from "next/navigation";
import { EditCaptures } from "@/components/session/EditCaptures";
import { db } from "@/lib/data";

/** Representative captures for the IC's own review window. In production these
 *  come from `session.resume` scoped to the signed-in user via RLS. */
const sampleCaptures: Record<
  string,
  { id: string; kind: string; summary: string }[]
> = {
  "ses-1": [
    { id: "e-1", kind: "bottleneck", summary: "New orders enter a shared queue and are worked manually in order of arrival." },
    { id: "e-2", kind: "handoff", summary: "Orders that trip a credit check are blocked until Finance reviews them." },
    { id: "e-3", kind: "frustration", summary: "Customers call asking why a paid order hasn't shipped while it sits on credit hold." },
  ],
  "ses-2": [
    { id: "e-4", kind: "workaround", summary: "Rush orders are tracked in a personal notebook when the system can't flag them." },
    { id: "e-5", kind: "handoff", summary: "Warehouse picking stalls waiting on the credit-hold release." },
  ],
  "ses-3": [
    { id: "e-6", kind: "tooling", summary: "Order status lives in the ERP but CS has no read access, so they ping Order Ops." },
  ],
};

export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = db.session.get(id);
  if (!session) notFound();

  return (
    <EditCaptures
      topicTitle={session.topicTitle}
      completedAt={session.completedAt ?? ""}
      editWindowEndsAt={session.editWindowEndsAt ?? ""}
      captures={sampleCaptures[id] ?? []}
    />
  );
}
