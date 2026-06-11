import { createElement } from "react";
import { and, eq } from "drizzle-orm";
import { withServiceRole, type Db } from "@/db/client";
import { sprints, tenants, users } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { log } from "@/lib/log";
import { captureFailure } from "@/lib/observability";
import { loadSprintProgress, listSprintOpportunities } from "@/lib/sprint-read";
import { sendEmail } from "@/services/email/send";
import { DigestEmail, type DigestAudience } from "@/emails/DigestEmail";
import { inngest } from "../client";

type DigestRecipient = {
  email: string;
  audience: DigestAudience;
};

export type SprintDigestData = {
  orgName: string;
  sprintName: string;
  participationPct: number;
  capturesCount: number;
  opportunitiesCount: number;
  topOpportunities: { title: string; score: number }[];
};

/**
 * Build one sprint's digest payload from the SAME read functions the dashboard
 * uses (`loadSprintProgress` + `listSprintOpportunities`), so the numbers in the
 * email and the numbers on the dashboard are identical by construction (Step 5).
 * Service-role read: the digest crons run cross-tenant with no user JWT.
 */
export async function buildSprintDigest(
  sprintId: string,
  tenantId: string,
): Promise<SprintDigestData | null> {
  return withServiceRole(
    { action: "digest.build", actor: "system", tenantId, targetId: sprintId },
    async (tx) => readSprintDigest(tx, sprintId, tenantId),
  );
}

async function readSprintDigest(
  tx: Db,
  sprintId: string,
  tenantId: string,
): Promise<SprintDigestData | null> {
  const [sprint] = await tx
    .select({ name: sprints.name })
    .from(sprints)
    .where(and(eq(sprints.id, sprintId), eq(sprints.tenantId, tenantId)));
  if (!sprint) return null;

  const [tenant] = await tx
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  const progress = await loadSprintProgress(tx, sprintId);
  const opps = await listSprintOpportunities(tx, sprintId);

  return {
    orgName: tenant?.name ?? "your organization",
    sprintName: sprint.name,
    participationPct: progress.completionPct,
    capturesCount: progress.capturesCount,
    opportunitiesCount: progress.opportunitiesCount,
    topOpportunities: opps.slice(0, 3).map((o) => ({
      title: o.title,
      score: Math.round(o.compositeScore),
    })),
  };
}

/** Recipients for an audience: managers, or sponsors, of the sprint's tenant. */
async function loadDigestRecipients(
  sprintId: string,
  tenantId: string,
  audience: DigestAudience,
): Promise<DigestRecipient[]> {
  return withServiceRole(
    { action: "digest.recipients", actor: "system", tenantId },
    async (tx) => {
      // Prefer the sprint's own sponsor/manager; fall back to tenant role.
      const [sprint] = await tx
        .select({ managerId: sprints.managerId, sponsorId: sprints.sponsorId })
        .from(sprints)
        .where(and(eq(sprints.id, sprintId), eq(sprints.tenantId, tenantId)));

      const namedId =
        audience === "manager" ? sprint?.managerId : sprint?.sponsorId;
      if (namedId) {
        const [u] = await tx
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, namedId));
        if (u) return [{ email: u.email, audience }];
      }

      const rows = await tx
        .select({ email: users.email })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.role, audience)));
      return rows.map((r) => ({ email: r.email, audience }));
    },
  );
}

/** Render + send one digest email. Throws on a real Resend failure (step retry). */
async function sendDigest(
  recipient: DigestRecipient,
  data: SprintDigestData,
): Promise<void> {
  const ctaUrl =
    recipient.audience === "sponsor" ? `${appUrl()}/report` : `${appUrl()}/`;
  await sendEmail({
    to: recipient.email,
    subject: `${data.sprintName}: weekly digest`,
    react: createElement(DigestEmail, {
      audience: recipient.audience,
      orgName: data.orgName,
      sprintName: data.sprintName,
      participationPct: data.participationPct,
      capturesCount: data.capturesCount,
      opportunitiesCount: data.opportunitiesCount,
      topOpportunities: data.topOpportunities,
      ctaUrl,
    }),
  });
}

/** All active sprints across tenants (cross-tenant cron read, audited). */
async function loadActiveSprintsForDigest(): Promise<
  { id: string; tenantId: string }[]
> {
  return withServiceRole(
    { action: "digest.scan", actor: "system" },
    async (tx) =>
      tx
        .select({ id: sprints.id, tenantId: sprints.tenantId })
        .from(sprints)
        .where(eq(sprints.status, "active")),
  );
}

/**
 * Build one Inngest function for a digest audience. Both digests run Monday 07:00
 * UTC: per active sprint, build the payload (dashboard-identical numbers) and
 * email each recipient as its own step (independent retry + visibility).
 */
function makeDigestFunction(audience: DigestAudience) {
  return inngest.createFunction(
    {
      id: `digest-weekly-${audience}`,
      name: `Weekly ${audience} digest`,
    },
    { cron: "0 7 * * 1" },
    async ({ step }) => {
      const active = await step.run("load-active-sprints", () =>
        loadActiveSprintsForDigest(),
      );

      let sent = 0;
      for (const s of active) {
        const data = await step.run(`digest:${s.id}`, () =>
          buildSprintDigest(s.id, s.tenantId),
        );
        if (!data) continue;

        const recipients = await step.run(`recipients:${s.id}`, () =>
          loadDigestRecipients(s.id, s.tenantId, audience),
        );

        for (const r of recipients) {
          await step.run(`send:${s.id}:${r.email}`, async () => {
            try {
              await sendDigest(r, data);
              return { sent: true };
            } catch (err) {
              captureFailure(err, {
                area: "jobs",
                tenantId: s.tenantId,
                tags: { job: `digest-weekly-${audience}` },
              });
              log.error("digest.send.failed", {
                area: "jobs",
                tenantId: s.tenantId,
              });
              throw err;
            }
          });
          sent += 1;
        }
      }

      log.info("digest.weekly.complete", { count: sent });
      return { sent };
    },
  );
}

export const digestWeeklySponsor = makeDigestFunction("sponsor");
export const digestWeeklyManager = makeDigestFunction("manager");
