/**
 * Atlas demo data + access layer.
 *
 * The functions below mirror the tRPC router surface in docs/02-architecture.md
 * §5 (e.g. `sprint.get`, `opportunity.listForSprint`). Today they read from
 * in-memory fixtures; when Supabase + RLS land, each becomes a real query with
 * the same signature, so call sites don't change.
 *
 * One tenant ("Northwind Logistics") is modelled end-to-end so every screen has
 * coherent, click-through-consistent data. Numbers are calibrated to the style
 * guide: 5–10 opportunities surfaced, 1–3 high-impact.
 */

import type {
  ActivityItem,
  ClientSummary,
  Opportunity,
  Session,
  Sprint,
  SprintProgress,
  User,
} from "./types";

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const sponsor: User = {
  id: "u-sponsor",
  name: "Dana Whitfield",
  email: "dana@northwind.example",
  role: "sponsor",
  department: "Executive",
  title: "COO",
};

const manager: User = {
  id: "u-manager",
  name: "Marcus Ortega",
  email: "marcus@northwind.example",
  role: "manager",
  department: "Operations",
  title: "VP Operations",
};

const ics: User[] = [
  {
    id: "u-1",
    name: "Priya Nair",
    email: "priya@northwind.example",
    role: "ic",
    department: "Order Ops",
    title: "Order Operations Lead",
  },
  {
    id: "u-2",
    name: "Tom Becker",
    email: "tom@northwind.example",
    role: "ic",
    department: "Finance",
    title: "Billing Analyst",
  },
  {
    id: "u-3",
    name: "Aisha Rahman",
    email: "aisha@northwind.example",
    role: "ic",
    department: "Sales Ops",
    title: "Sales Operations Manager",
  },
  {
    id: "u-4",
    name: "Luis Costa",
    email: "luis@northwind.example",
    role: "ic",
    department: "Warehouse",
    title: "Fulfillment Coordinator",
  },
  {
    id: "u-5",
    name: "Hannah Kim",
    email: "hannah@northwind.example",
    role: "ic",
    department: "Customer Success",
    title: "CS Team Lead",
  },
  {
    id: "u-6",
    name: "Diego Santos",
    email: "diego@northwind.example",
    role: "ic",
    department: "Finance",
    title: "AR Specialist",
  },
  {
    id: "u-7",
    name: "Grace Liu",
    email: "grace@northwind.example",
    role: "ic",
    department: "Order Ops",
    title: "Order Coordinator",
  },
  {
    id: "u-8",
    name: "Owen Park",
    email: "owen@northwind.example",
    role: "ic",
    department: "Procurement",
    title: "Procurement Analyst",
  },
];

/** The signed-in IC for the personal-journey screens (/me, /session). */
export const currentIc = ics[0];

// ---------------------------------------------------------------------------
// Sprint
// ---------------------------------------------------------------------------

const sprint: Sprint = {
  id: "spr-northwind-q2",
  tenantName: "Northwind Logistics",
  tenantSegment: "Mid-market operator · 3PL",
  name: "Operations Discovery — Spring '26",
  primaryFocus: "Quote-to-cash & exception handling",
  scopeDepartment: "Operations, Finance, Sales Ops",
  status: "active",
  startDate: "May 18, 2026",
  endDate: "Jun 12, 2026",
  dayOf: 16,
  dayTotal: 24,
  cadence: "Weekly · 4 sessions per person",
  sponsor,
  manager,
  topics: [
    {
      id: "t-1",
      title: "How work flows",
      description:
        "Walk through a normal order, end to end. Where does it move smoothly, where does it stall?",
      orderIdx: 1,
      questionCount: 5,
      estMinutes: 6,
    },
    {
      id: "t-2",
      title: "When things break",
      description:
        "The exceptions, the rush jobs, the manual fixes that never made it into a process doc.",
      orderIdx: 2,
      questionCount: 5,
      estMinutes: 6,
    },
    {
      id: "t-3",
      title: "Tools & systems",
      description:
        "What systems you touch, where they don't talk to each other, where the spreadsheets live.",
      orderIdx: 3,
      questionCount: 4,
      estMinutes: 5,
    },
    {
      id: "t-4",
      title: "One change",
      description:
        "If you could change one thing about how the team works, what would move the needle most?",
      orderIdx: 4,
      questionCount: 3,
      estMinutes: 4,
    },
  ],
  participants: [
    {
      user: ics[0],
      status: "in_progress",
      sessionsCompleted: 3,
      sessionsTotal: 4,
      lastActiveLabel: "Active 12m ago",
      capturesContributed: 14,
    },
    {
      user: ics[1],
      status: "completed",
      sessionsCompleted: 4,
      sessionsTotal: 4,
      lastActiveLabel: "Completed yesterday",
      capturesContributed: 19,
    },
    {
      user: ics[2],
      status: "completed",
      sessionsCompleted: 4,
      sessionsTotal: 4,
      lastActiveLabel: "Completed 2d ago",
      capturesContributed: 22,
    },
    {
      user: ics[3],
      status: "in_progress",
      sessionsCompleted: 2,
      sessionsTotal: 4,
      lastActiveLabel: "Active 1h ago",
      capturesContributed: 9,
    },
    {
      user: ics[4],
      status: "completed",
      sessionsCompleted: 4,
      sessionsTotal: 4,
      lastActiveLabel: "Completed 3d ago",
      capturesContributed: 17,
    },
    {
      user: ics[5],
      status: "idle",
      sessionsCompleted: 1,
      sessionsTotal: 4,
      lastActiveLabel: "Idle · last seen 4d ago",
      capturesContributed: 4,
    },
    {
      user: ics[6],
      status: "in_progress",
      sessionsCompleted: 2,
      sessionsTotal: 4,
      lastActiveLabel: "Active 5h ago",
      capturesContributed: 11,
    },
    {
      user: ics[7],
      status: "not_started",
      sessionsCompleted: 0,
      sessionsTotal: 4,
      lastActiveLabel: "Invited · not started",
      capturesContributed: 0,
    },
  ],
};

const progress: SprintProgress = {
  completionPct: 63,
  weeklyActiveContributors: 6,
  participantCount: 8,
  sessionsCompleted: 20,
  sessionsTotal: 32,
  opportunitiesCount: 7,
  highImpactCount: 2,
  capturesCount: 96,
  signalQuality: 4.6,
};

// ---------------------------------------------------------------------------
// Sessions for the current IC (/me)
// ---------------------------------------------------------------------------

const mySessions: Session[] = [
  {
    id: "ses-1",
    topicId: "t-1",
    topicTitle: "How work flows",
    userId: currentIc.id,
    status: "completed",
    totalSeconds: 372,
    messagesCount: 11,
    captureCount: 6,
    completedAt: "May 21, 2026",
    editWindowEndsAt: "May 28, 2026",
  },
  {
    id: "ses-2",
    topicId: "t-2",
    topicTitle: "When things break",
    userId: currentIc.id,
    status: "completed",
    totalSeconds: 411,
    messagesCount: 13,
    captureCount: 5,
    completedAt: "May 26, 2026",
    editWindowEndsAt: "Jun 2, 2026",
  },
  {
    id: "ses-3",
    topicId: "t-3",
    topicTitle: "Tools & systems",
    userId: currentIc.id,
    status: "completed",
    totalSeconds: 298,
    messagesCount: 9,
    captureCount: 3,
    completedAt: "Jun 1, 2026",
    editWindowEndsAt: "Jun 8, 2026",
  },
  {
    id: "ses-4",
    topicId: "t-4",
    topicTitle: "One change",
    userId: currentIc.id,
    status: "not_started",
    messagesCount: 0,
    captureCount: 0,
  },
];

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

const opportunities: Opportunity[] = [
  {
    id: "opp-1",
    sprintId: sprint.id,
    title: "Automate the manual credit-hold release on stuck orders",
    description:
      "Orders that trip a credit check sit in a queue until someone in Finance manually reviews and releases them. The review is rules-based 90% of the time, but it waits for a human — often overnight — while the customer waits and the warehouse can't pick.",
    category: "Order-to-cash",
    departments: ["Finance", "Order Ops", "Warehouse"],
    impactLow: 480_000,
    impactHigh: 920_000,
    timeToShipWeeksLow: 3,
    timeToShipWeeksHigh: 5,
    confidenceScore: 5,
    compositeScore: 8.7,
    status: "surfaced",
    contributorCount: 5,
    dimensionScores: [
      {
        key: "impact",
        label: "Financial impact",
        score: 9,
        reasoning:
          "Median 4.2-day release delay across ~140 held orders/month; each delayed day ties up working capital and risks cancellation.",
      },
      {
        key: "feasibility",
        label: "Implementation feasibility",
        score: 8,
        reasoning:
          "Credit rules already documented in the ERP; a rules engine + exception queue is well-trodden. No new data sources.",
      },
      {
        key: "time",
        label: "Time to value",
        score: 9,
        reasoning:
          "First auto-releases shippable in 3 weeks; full rollout under a month.",
      },
      {
        key: "alignment",
        label: "Strategic alignment",
        score: 8,
        reasoning:
          "Directly serves the COO's stated Q2 goal of cutting order cycle time.",
      },
      {
        key: "evidence",
        label: "Evidence confidence",
        score: 9,
        reasoning:
          "Corroborated independently by 5 contributors across Finance, Order Ops, and Warehouse.",
      },
    ],
    rationale:
      "Finance and Order Ops independently described the same bottleneck: a credit-hold queue that clears only when a person works it, usually once a day. The AR Specialist estimated 90% of releases follow fixed rules already encoded in the ERP, and a Warehouse coordinator confirmed picks stall waiting on the release. Automating the rules-based majority and routing only true edge cases to a human would remove a multi-day delay on roughly 140 orders a month — the single most-cited friction point in the sprint.",
    patternMatch: {
      title: "Rules-based approval auto-release",
      deploys: 7,
      similarity: 0.88,
    },
    evidence: [
      {
        id: "c-1",
        kind: "bottleneck",
        contributorRole: "AR Specialist",
        summary:
          "Credit-hold queue is worked once daily, so most holds wait overnight before release.",
        sourceQuote:
          "Honestly 9 out of 10 of them I just check against the same limits and release. It's not judgment, it's just… I have to physically get to them.",
        tags: ["credit-hold", "manual-review"],
      },
      {
        id: "c-2",
        kind: "handoff",
        contributorRole: "Fulfillment Coordinator",
        summary:
          "Warehouse can't start picking until Finance releases the hold, idling staff.",
        sourceQuote:
          "We see the order, we just can't touch it. So we work around it and pick the next one, then have to circle back.",
        tags: ["picking", "blocked"],
      },
      {
        id: "c-3",
        kind: "frustration",
        contributorRole: "Order Operations Lead",
        summary:
          "Customers call asking why a paid order hasn't shipped while it sits on credit hold.",
        sourceQuote:
          "The worst calls are 'I paid you, where's my stuff' — and it's just sitting in a queue nobody got to yet.",
        tags: ["customer", "delay"],
      },
    ],
  },
  {
    id: "opp-2",
    sprintId: sprint.id,
    title: "Replace the shadow shipping-rate spreadsheet with a live quote",
    description:
      "Sales Ops maintains a private spreadsheet of negotiated carrier rates because the system's rate card is stale. Quotes are built by hand from it, which is slow and drifts out of sync whenever carriers change pricing.",
    category: "Quote-to-cash",
    departments: ["Sales Ops", "Finance"],
    impactLow: 220_000,
    impactHigh: 540_000,
    timeToShipWeeksLow: 4,
    timeToShipWeeksHigh: 7,
    confidenceScore: 4,
    compositeScore: 7.9,
    status: "surfaced",
    contributorCount: 4,
    dimensionScores: [
      {
        key: "impact",
        label: "Financial impact",
        score: 8,
        reasoning:
          "Quote turnaround is a deal-velocity lever; stale rates also leak margin on undercharged lanes.",
      },
      {
        key: "feasibility",
        label: "Implementation feasibility",
        score: 7,
        reasoning:
          "Carrier rate ingestion is doable but depends on a few carriers' file formats.",
      },
      {
        key: "time",
        label: "Time to value",
        score: 7,
        reasoning:
          "Needs a rate-sync integration before the quote tool is trustworthy.",
      },
      {
        key: "alignment",
        label: "Strategic alignment",
        score: 8,
        reasoning: "Quote-to-cash is the sprint's named primary focus.",
      },
      {
        key: "evidence",
        label: "Evidence confidence",
        score: 7,
        reasoning:
          "Four contributors; the spreadsheet itself was uploaded as a supporting document.",
      },
    ],
    rationale:
      "The Sales Operations Manager and two analysts described the same shadow spreadsheet that has quietly become the source of truth for shipping rates. Quotes are assembled by hand from it because the ERP rate card lags carrier changes by weeks. Beyond the time cost, Finance flagged margin leakage on lanes that were never updated. Syncing carrier rates into a live quote would both speed quoting and stop the silent undercharging.",
    patternMatch: {
      title: "Spreadsheet-to-system source-of-truth migration",
      deploys: 11,
      similarity: 0.82,
    },
    evidence: [
      {
        id: "c-4",
        kind: "workaround",
        contributorRole: "Sales Operations Manager",
        summary:
          "Negotiated rates live in a personal spreadsheet, not the system.",
        sourceQuote:
          "The real rates are in my sheet. The system's rate card I don't even look at, it's months behind.",
        tags: ["spreadsheet", "rates"],
      },
      {
        id: "c-5",
        kind: "tooling",
        contributorRole: "Billing Analyst",
        summary: "Margin leaks when quotes use outdated lane pricing.",
        sourceQuote:
          "Twice this quarter we shipped a lane at a rate that cost us money because nobody updated it.",
        tags: ["margin", "pricing"],
      },
    ],
  },
  {
    id: "opp-3",
    sprintId: sprint.id,
    title: "Standardize the rush-order intake so nothing falls through Slack",
    description:
      "Rush orders come in through Slack DMs, email, and hallway conversations. There's no single intake, so they're easy to lose and impossible to prioritize consistently.",
    category: "Exception handling",
    departments: ["Order Ops", "Customer Success"],
    impactLow: 140_000,
    impactHigh: 310_000,
    timeToShipWeeksLow: 2,
    timeToShipWeeksHigh: 3,
    confidenceScore: 4,
    compositeScore: 7.4,
    status: "surfaced",
    contributorCount: 4,
    dimensionScores: [
      {
        key: "impact",
        label: "Financial impact",
        score: 6,
        reasoning:
          "Lost/late rush orders carry expedite costs and churn risk, though volume is moderate.",
      },
      {
        key: "feasibility",
        label: "Implementation feasibility",
        score: 9,
        reasoning: "A single intake form + triage queue is low-complexity.",
      },
      {
        key: "time",
        label: "Time to value",
        score: 9,
        reasoning: "Shippable as a quick win in 2 weeks.",
      },
      {
        key: "alignment",
        label: "Strategic alignment",
        score: 7,
        reasoning:
          "Supports exception-handling focus and CS satisfaction goals.",
      },
      {
        key: "evidence",
        label: "Evidence confidence",
        score: 7,
        reasoning:
          "Four contributors; consistent story across Order Ops and CS.",
      },
    ],
    rationale:
      "Order Ops and Customer Success both described rush orders arriving through whatever channel the requester happened to use — Slack, email, a tap on the shoulder. Without one intake, prioritization is ad hoc and the occasional rush order is simply lost until the customer escalates. A single intake form feeding a triage queue is a fast, cheap quick win that several contributors asked for unprompted.",
    evidence: [
      {
        id: "c-6",
        kind: "workaround",
        contributorRole: "CS Team Lead",
        summary: "Rush requests come via Slack DM and get buried.",
        sourceQuote:
          "If I'm in a meeting when the DM comes in, sometimes it's just gone. I find it two days later.",
        tags: ["rush", "intake"],
      },
      {
        id: "c-7",
        kind: "bottleneck",
        contributorRole: "Order Coordinator",
        summary:
          "No consistent way to know which rush order is actually most urgent.",
        sourceQuote:
          "Everything's 'urgent.' I have no way to tell the real ones apart, so I guess.",
        tags: ["triage", "priority"],
      },
    ],
  },
  {
    id: "opp-4",
    sprintId: sprint.id,
    title: "Auto-reconcile carrier invoices against shipped orders",
    description:
      "AR manually matches carrier invoices to orders to catch overbilling. It's tedious, so it's done by sampling — which means most discrepancies are never caught.",
    category: "Order-to-cash",
    departments: ["Finance"],
    impactLow: 180_000,
    impactHigh: 420_000,
    timeToShipWeeksLow: 5,
    timeToShipWeeksHigh: 8,
    confidenceScore: 3,
    compositeScore: 6.8,
    status: "surfaced",
    contributorCount: 2,
    dimensionScores: [
      {
        key: "impact",
        label: "Financial impact",
        score: 8,
        reasoning:
          "Recovered overbilling is direct margin; sampling implies most is currently missed.",
      },
      {
        key: "feasibility",
        label: "Implementation feasibility",
        score: 6,
        reasoning:
          "Requires reliable order-to-invoice matching keys; some carrier data is messy.",
      },
      {
        key: "time",
        label: "Time to value",
        score: 5,
        reasoning: "Data-cleanup heavy before automation is trustworthy.",
      },
      {
        key: "alignment",
        label: "Strategic alignment",
        score: 6,
        reasoning: "Cost-recovery angle is secondary to the cycle-time focus.",
      },
      {
        key: "evidence",
        label: "Evidence confidence",
        score: 5,
        reasoning:
          "Only two contributors; impact is estimated, not yet corroborated by document.",
      },
    ],
    rationale:
      "Two Finance contributors described manually spot-checking carrier invoices for overbilling because checking all of them is infeasible by hand. By their own account, sampling means most discrepancies go uncaught. Automated reconciliation against shipped orders would surface the full set — but the evidence base is thinner here (two voices) and the data matching needs validation, so confidence is moderate.",
    evidence: [
      {
        id: "c-8",
        kind: "frustration",
        contributorRole: "AR Specialist",
        summary:
          "Invoice checking is sampled because full review is impossible manually.",
        sourceQuote:
          "I check maybe one in five. I know we're getting overbilled on the rest, I just can't physically check them all.",
        tags: ["reconciliation", "overbilling"],
      },
    ],
  },
  {
    id: "opp-5",
    sprintId: sprint.id,
    title: "Give CS a read-only order-status view to kill status-check pings",
    description:
      "Customer Success constantly pings Order Ops for status because they can't see order state directly. Both sides lose time on a question a dashboard could answer.",
    category: "Exception handling",
    departments: ["Customer Success", "Order Ops"],
    impactLow: 90_000,
    impactHigh: 180_000,
    timeToShipWeeksLow: 1,
    timeToShipWeeksHigh: 2,
    confidenceScore: 4,
    compositeScore: 6.5,
    status: "surfaced",
    contributorCount: 3,
    dimensionScores: [
      {
        key: "impact",
        label: "Financial impact",
        score: 5,
        reasoning:
          "Time savings on both sides; modest but real and continuous.",
      },
      {
        key: "feasibility",
        label: "Implementation feasibility",
        score: 9,
        reasoning: "A read-only view over existing order data is trivial.",
      },
      {
        key: "time",
        label: "Time to value",
        score: 10,
        reasoning: "Days, not weeks.",
      },
      {
        key: "alignment",
        label: "Strategic alignment",
        score: 5,
        reasoning: "Quality-of-life win more than strategic lever.",
      },
      {
        key: "evidence",
        label: "Evidence confidence",
        score: 7,
        reasoning: "Three contributors; consistent and concrete.",
      },
    ],
    rationale:
      "Customer Success and Order Ops described a constant back-and-forth: CS can't see order status, so they ping Order Ops, who stop what they're doing to look it up. A read-only status view is the cheapest item in the backlog and removes a recurring interruption both teams named.",
    evidence: [
      {
        id: "c-9",
        kind: "handoff",
        contributorRole: "CS Team Lead",
        summary:
          "CS interrupts Order Ops repeatedly for status they can't see themselves.",
        sourceQuote:
          "I feel bad pinging Priya twenty times a day, but I genuinely can't see where the order is.",
        tags: ["visibility", "status"],
      },
    ],
  },
  {
    id: "opp-6",
    sprintId: sprint.id,
    title: "Codify the tribal 'who-to-ask' map for exceptions",
    description:
      "When an exception hits, resolving it depends on knowing the one person who handles that edge case. That knowledge is entirely tribal and walks out the door when people leave.",
    category: "Knowledge",
    departments: ["Operations"],
    impactLow: 60_000,
    impactHigh: 140_000,
    timeToShipWeeksLow: 2,
    timeToShipWeeksHigh: 4,
    confidenceScore: 3,
    compositeScore: 5.9,
    status: "surfaced",
    contributorCount: 3,
    dimensionScores: [
      {
        key: "impact",
        label: "Financial impact",
        score: 5,
        reasoning:
          "Reduces resolution time and key-person risk; hard to quantify precisely.",
      },
      {
        key: "feasibility",
        label: "Implementation feasibility",
        score: 7,
        reasoning: "Mostly a capture-and-structure exercise.",
      },
      {
        key: "time",
        label: "Time to value",
        score: 6,
        reasoning: "Value compounds slowly as the map fills in.",
      },
      {
        key: "alignment",
        label: "Strategic alignment",
        score: 5,
        reasoning: "Resilience play rather than a direct cycle-time win.",
      },
      {
        key: "evidence",
        label: "Evidence confidence",
        score: 5,
        reasoning: "Three contributors; somewhat diffuse.",
      },
    ],
    rationale:
      "Several contributors independently mentioned that resolving an exception often comes down to knowing the single person who handles it. That routing knowledge isn't written anywhere. It's a real resilience risk, but the impact is diffuse and harder to price, so it ranks lower than the cycle-time items.",
    evidence: [
      {
        id: "c-10",
        kind: "sop",
        contributorRole: "Order Operations Lead",
        summary:
          "Exception routing depends on tribal knowledge of who handles what.",
        sourceQuote:
          "If you don't know that customs stuff goes to Owen, you're stuck. It's not written anywhere.",
        tags: ["tribal-knowledge", "routing"],
      },
    ],
  },
  {
    id: "opp-7",
    sprintId: sprint.id,
    title: "Pre-fill returns paperwork from the original order",
    description:
      "Returns are re-keyed by hand from the original order, which is slow and error-prone. The data already exists in the system.",
    category: "Exception handling",
    departments: ["Order Ops", "Warehouse"],
    impactLow: 70_000,
    impactHigh: 150_000,
    timeToShipWeeksLow: 2,
    timeToShipWeeksHigh: 3,
    confidenceScore: 3,
    compositeScore: 5.6,
    status: "surfaced",
    contributorCount: 2,
    dimensionScores: [
      {
        key: "impact",
        label: "Financial impact",
        score: 4,
        reasoning:
          "Saves re-keying time and reduces return errors; modest volume.",
      },
      {
        key: "feasibility",
        label: "Implementation feasibility",
        score: 8,
        reasoning: "Pre-fill from existing order data is straightforward.",
      },
      {
        key: "time",
        label: "Time to value",
        score: 8,
        reasoning: "Quick win, 2–3 weeks.",
      },
      {
        key: "alignment",
        label: "Strategic alignment",
        score: 4,
        reasoning: "Narrow process improvement.",
      },
      {
        key: "evidence",
        label: "Evidence confidence",
        score: 5,
        reasoning: "Two contributors.",
      },
    ],
    rationale:
      "Two contributors described re-keying returns by hand from the original order, introducing errors that then have to be chased down. The source data already exists in the system. It's a tidy quick win, just narrow in scope and lightly evidenced relative to the top items.",
    evidence: [
      {
        id: "c-11",
        kind: "workaround",
        contributorRole: "Order Coordinator",
        summary:
          "Returns paperwork is re-typed from the original order by hand.",
        sourceQuote:
          "I'm literally copying numbers off the original order into the return form. Of course I fat-finger one sometimes.",
        tags: ["returns", "re-keying"],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Activity feed (manager dashboard)
// ---------------------------------------------------------------------------

const activity: ActivityItem[] = [
  {
    id: "a-1",
    kind: "opportunity_surfaced",
    label: "New opportunity surfaced: “Automate manual credit-hold release”",
    timeLabel: "12m ago",
  },
  {
    id: "a-2",
    kind: "session_completed",
    label: "Order Operations Lead completed “Tools & systems”",
    timeLabel: "1h ago",
  },
  {
    id: "a-3",
    kind: "session_completed",
    label: "Fulfillment Coordinator completed “When things break”",
    timeLabel: "1h ago",
  },
  {
    id: "a-4",
    kind: "nudge_sent",
    label: "Reminder sent to AR Specialist (idle 4 days)",
    timeLabel: "3h ago",
  },
  {
    id: "a-5",
    kind: "session_completed",
    label: "Sales Operations Manager completed the sprint (4/4)",
    timeLabel: "2d ago",
  },
  {
    id: "a-6",
    kind: "opportunity_surfaced",
    label: "New opportunity surfaced: “Shadow shipping-rate spreadsheet”",
    timeLabel: "2d ago",
  },
];

// ---------------------------------------------------------------------------
// Twistag cockpit — multi-client overview
// ---------------------------------------------------------------------------

const clients: ClientSummary[] = [
  {
    tenantId: sprint.id,
    name: "Northwind Logistics",
    segment: "Mid-market · 3PL",
    sprintName: "Operations Discovery — Spring '26",
    health: "healthy",
    completionPct: 63,
    opportunities: 7,
    approved: 1,
    engagementLead: "You",
  },
  {
    tenantId: "cli-helios",
    name: "Helios Health",
    segment: "PE portco · 100-day",
    sprintName: "Revenue Ops Discovery",
    health: "watch",
    completionPct: 41,
    opportunities: 4,
    approved: 0,
    engagementLead: "You",
    alert: "Participation stalled at 41% — 2 ICs idle >5 days",
  },
  {
    tenantId: "cli-vela",
    name: "Vela Software",
    segment: "Funded SaaS · Series B",
    sprintName: "Support & Onboarding Discovery",
    health: "healthy",
    completionPct: 78,
    opportunities: 9,
    approved: 2,
    engagementLead: "You",
  },
  {
    tenantId: "cli-orbit",
    name: "Orbit Freight",
    segment: "Mid-market · operator",
    sprintName: "Finance Ops Discovery",
    health: "at_risk",
    completionPct: 22,
    opportunities: 2,
    approved: 0,
    engagementLead: "You",
    alert: "Sponsor unresponsive 8 days — kickoff momentum lost",
  },
];

// ---------------------------------------------------------------------------
// Scripted conversation engine (no LLM key in this environment).
// Mirrors the Arc state machine in docs/02-architecture.md §6.1. The seam for a
// real Claude call is server/services/conversation — see app/api/session/respond.
// ---------------------------------------------------------------------------

interface ScriptStep {
  assistant: string;
  /** A capture the extraction pass would lift from the user's reply to the PREVIOUS question. */
  captureOnReply?: { kind: string; summary: string };
}

export const conversationScript: ScriptStep[] = [
  {
    assistant:
      "Thanks for making time, Priya. No right answers here — I'm just trying to understand how order operations actually run day to day.\n\nTo start: walk me through what happens when a new order comes in. Where does it go first?",
  },
  {
    assistant:
      "That's helpful. So it lands in the queue and you pick it up. When you say some orders “get stuck” before you can release them — what makes one stick?",
    captureOnReply: {
      kind: "bottleneck",
      summary:
        "New orders enter a shared queue and are worked manually in order of arrival.",
    },
  },
  {
    assistant:
      "Got it — credit holds. And when one trips a hold, who actually clears it, and how long does that usually take?",
    captureOnReply: {
      kind: "handoff",
      summary:
        "Orders that trip a credit check are blocked until Finance reviews them.",
    },
  },
  {
    assistant:
      "So it waits for the daily pass in Finance. Last question on this thread: when you're waiting on that release, what do the downstream folks — warehouse, the customer — experience?",
    captureOnReply: {
      kind: "frustration",
      summary:
        "Credit-hold releases wait for a once-daily manual review, often overnight.",
    },
  },
  {
    assistant:
      "That lands. You've given me a really clear picture of where the credit-hold step slows everything down — I've captured a few things on the right as we talked. Want to keep going into tools next, or pause here? Either is fine.",
    captureOnReply: {
      kind: "handoff",
      summary:
        "Warehouse picking and customers both stall waiting on credit-hold release.",
    },
  },
];

// ---------------------------------------------------------------------------
// Access layer — mirrors the tRPC routers.
// ---------------------------------------------------------------------------

export const db = {
  sprint: {
    get: (_id?: string): Sprint => sprint,
    progress: (_id?: string): SprintProgress => progress,
    activity: (): ActivityItem[] => activity,
  },
  session: {
    mine: (): Session[] => mySessions,
    get: (id: string): Session | undefined =>
      mySessions.find((s) => s.id === id),
  },
  opportunity: {
    listForSprint: (_sprintId?: string): Opportunity[] =>
      [...opportunities].sort((a, b) => b.compositeScore - a.compositeScore),
    get: (id: string): Opportunity | undefined =>
      opportunities.find((o) => o.id === id),
  },
  twistag: {
    clientList: (): ClientSummary[] => clients,
  },
  me: (): User => currentIc,
};

/** SOW draft auto-generated on opportunity approval (see ATL-502). */
export function sowDraftFor(opp: Opportunity): import("./types").SowDraft {
  return {
    title: `${opp.title} — discovery-to-ship engagement`,
    scope: `Design and ship the ${opp.title.toLowerCase()} capability for ${sprint.tenantName}, covering the rules-based majority of cases with a clean exception path for the remainder. Includes integration with the existing ERP, a review queue for edge cases, and rollout support.`,
    inclusions: [
      "Discovery confirmation workshop (½ day)",
      "Rules engine + exception queue implementation",
      "ERP integration for the affected workflow",
      "Two-week hypercare after go-live",
    ],
    exclusions: [
      "Changes to upstream ERP configuration beyond the affected workflow",
      "New carrier or vendor integrations not named above",
    ],
    team: [
      { role: "Forward-Deployed Engineer (lead)", allocation: "Full-time" },
      { role: "Forward-Deployed Engineer", allocation: "Half-time" },
      { role: "Engagement lead", allocation: "Oversight" },
    ],
    durationWeeks: opp.timeToShipWeeksHigh,
    priceUsd: 68_000,
    successMetrics: [
      "≥80% of eligible cases auto-processed within 1 hour",
      "Median release delay cut from 4.2 days to <1 day",
      "Zero increase in error/dispute rate vs. manual baseline",
    ],
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function usdRange(low: number, high: number): string {
  return `${usdShort(low)}–${usdShort(high)}`;
}

export function usdShort(n: number): string {
  if (n >= 1_000_000)
    return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}
