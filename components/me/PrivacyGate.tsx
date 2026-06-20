import { Check, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ackPrivacy } from "@/app/(app)/me/actions";

// The four promises, drawn from the /me privacy box (PRD F1.5).
const PROMISES = [
  "Attributed to you by name and role in what your manager and sponsor see — so they can follow up with you directly.",
  "Edit or remove anything you said for 7 days after each session.",
  "Skip any question you'd rather not answer.",
  "Only the themes and quotes from your sessions are shared — never your full transcript.",
];

/**
 * Shown on /me before a participant's first session, while privacy_ack_at is
 * null. The "Got it — start" button records the acknowledgement, after which the
 * session links become active.
 */
export function PrivacyGate() {
  return (
    <Card className="mb-6 border-brand/30 p-6">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-brand">
        <ShieldCheck className="h-3.5 w-3.5" />
        Before your first session
      </div>
      <h2 className="text-xl font-semibold tracking-tight">
        How your answers are handled
      </h2>
      <ul className="mt-4 space-y-2.5">
        {PROMISES.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-md text-text-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {p}
          </li>
        ))}
      </ul>
      <form action={ackPrivacy} className="mt-5">
        <Button type="submit" variant="brand">
          Got it — start
        </Button>
      </form>
    </Card>
  );
}
