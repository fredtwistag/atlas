/**
 * The four default discovery topics a sprint launches with. Mirrors the demo
 * topics in lib/data.ts; the launch form pre-checks all four and the
 * sprint.launch mutation materializes the selected ones into `topics` rows.
 */
export interface TopicTemplate {
  key: string;
  title: string;
  description: string;
  orderIdx: number;
  questionCount: number;
  estMinutes: number;
}

export const TOPIC_TEMPLATES: TopicTemplate[] = [
  {
    key: "how-work-flows",
    title: "How work flows",
    description:
      "Walk through a normal order, end to end. Where does it move smoothly, where does it stall?",
    orderIdx: 1,
    questionCount: 5,
    estMinutes: 6,
  },
  {
    key: "when-things-break",
    title: "When things break",
    description:
      "The exceptions, the rush jobs, the manual fixes that never made it into a process doc.",
    orderIdx: 2,
    questionCount: 5,
    estMinutes: 6,
  },
  {
    key: "tools-and-systems",
    title: "Tools & systems",
    description:
      "What systems you touch, where they don't talk to each other, where the spreadsheets live.",
    orderIdx: 3,
    questionCount: 4,
    estMinutes: 5,
  },
  {
    key: "one-change",
    title: "One change",
    description:
      "If you could change one thing about how the team works, what would move the needle most?",
    orderIdx: 4,
    questionCount: 3,
    estMinutes: 4,
  },
];
