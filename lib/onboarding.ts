/**
 * Manager first-run checklist, derived from live data (no new tables) — the
 * Linear/Vanta pattern. The steps mirror the pilot-playbook Day 0-5 sequence.
 */
export interface ChecklistStep {
  title: string;
  description: string;
  done: boolean;
}

export function managerChecklist(input: {
  memberCount: number;
  hasSprint: boolean;
}): ChecklistStep[] {
  return [
    {
      title: "Invite your team",
      description: "Add the people whose work the discovery sprint will cover.",
      done: input.memberCount > 0,
    },
    {
      title: "Send the heads-up message",
      description:
        "Give your team a plain-language heads-up before the Atlas email lands.",
      done: false,
    },
    {
      title: "Launch your sprint",
      description:
        "Pick the topics and participants — everyone gets their own short sessions.",
      done: input.hasSprint,
    },
  ];
}

/**
 * The manager kick-off message, ready to paste. Adapted from
 * docs/05-pilot-playbook.md §7 (the "magic link" line updated to the sign-in
 * link + 6-digit code we actually send). No placeholders so it copies clean.
 */
export function headsUpTemplate(): string {
  return `Subject: Quick heads-up before you hear about Atlas

Hi team,

Over the next 3-4 weeks we're running an internal exercise to map how our work actually happens. The goal is to find where time is going so we can fix the parts that frustrate us most.

You'll get an email from "Atlas" with a sign-in link and a 6-digit code. It'll ask you 4 short questions over the next 3 weeks — each takes about 5 minutes.

Your answers are aggregated and won't be used to evaluate you. I'll only see themes, not individual quotes attributed to you. You can edit anything you said within 7 days, or skip questions.

If you have any questions, ping me directly.

Thanks for the time — this should make our work better, not waste it.`;
}
