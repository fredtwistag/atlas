import { createElement } from "react";
import { and, eq } from "drizzle-orm";
import { withServiceRole, type Db } from "@/db/client";
import {
  sprints,
  topics,
  users,
  tenants,
  sprintParticipants,
} from "@/db/schema";
import { log } from "@/lib/log";
import { captureFailure } from "@/lib/observability";
import { sendEmail } from "@/services/email/send";
import { generateInviteLink } from "@/services/email/invite-link";
import { InviteEmail, inviteSubject } from "@/emails/InviteEmail";
import { inngest, type AtlasEvents } from "../client";

export type InviteSendInput = AtlasEvents["sprint/launched"]["data"];

type InviteContext = {
  ics: { email: string; name: string }[];
  orgName: string;
  inviterName: string;
  topics: { title: string; estMinutes: number }[];
};

/**
 * Load everything an invite needs for a launched sprint: the IC participants,
 * the org name, the launching manager's name, and the topic preview. Read under
 * the sanctioned worker service-role context (CLAUDE.md) — the tRPC launch path
 * no longer fans these emails out itself.
 */
export async function loadInviteContext(
  input: InviteSendInput,
): Promise<InviteContext> {
  return withServiceRole(
    {
      action: "sprint.invite.load",
      actor: "system",
      tenantId: input.tenantId,
      targetId: input.sprintId,
    },
    async (tx) => readInviteContext(tx, input),
  );
}

async function readInviteContext(
  tx: Db,
  input: InviteSendInput,
): Promise<InviteContext> {
  const { sprintId, tenantId } = input;

  const icRows = await tx
    .select({ email: users.email, name: users.name })
    .from(sprintParticipants)
    .innerJoin(users, eq(sprintParticipants.userId, users.id))
    .where(
      and(
        eq(sprintParticipants.sprintId, sprintId),
        eq(sprintParticipants.tenantId, tenantId),
        eq(users.role, "ic"),
      ),
    );

  const [sprint] = await tx
    .select({ managerId: sprints.managerId })
    .from(sprints)
    .where(and(eq(sprints.id, sprintId), eq(sprints.tenantId, tenantId)));

  const [tenant] = await tx
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  let inviterName = "Your manager";
  if (sprint?.managerId) {
    const [manager] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, sprint.managerId));
    if (manager) inviterName = manager.name;
  }

  const topicRows = await tx
    .select({ title: topics.title, estMinutes: topics.estMinutes })
    .from(topics)
    .where(eq(topics.sprintId, sprintId))
    .orderBy(topics.orderIdx);

  return {
    ics: icRows,
    orgName: tenant?.name ?? "your organization",
    inviterName,
    topics: topicRows,
  };
}

/** Send one IC's launch invite. Throws on a real Resend failure (so the step retries). */
export async function sendInvite(
  ic: { email: string; name: string },
  ctx: Omit<InviteContext, "ics">,
): Promise<void> {
  const confirmUrl = await generateInviteLink(ic.email);
  await sendEmail({
    to: ic.email,
    subject: inviteSubject("ic", ctx.inviterName, ctx.orgName),
    react: createElement(InviteEmail, {
      role: "ic",
      orgName: ctx.orgName,
      inviterName: ctx.inviterName,
      confirmUrl,
      topics: ctx.topics,
    }),
  });
}

/**
 * On `sprint/launched`: email every IC their "your sprint is live" invite, one
 * per Inngest step. Each step retries independently and a failure is visible in
 * the dashboard instead of being swallowed by `Promise.allSettled` (the old
 * post-commit path in sprint.launch). The launch transaction is long committed
 * by the time this runs, so a send failure never undoes the sprint — exactly the
 * old guarantee, now with retries and visibility.
 *
 * Privacy: count-only logging; never the email address or the IC's name.
 */
export const inviteSend = inngest.createFunction(
  { id: "invite-send", name: "Send launch invites to ICs" },
  { event: "sprint/launched" },
  async ({ event, step }) => {
    const data = event.data;
    const ctx = await step.run("load-invite-context", () =>
      loadInviteContext(data),
    );

    for (const ic of ctx.ics) {
      // Per-IC step: independent retry + a visible row in the dashboard. The
      // step id is the email so a retried run is idempotent at the step level.
      await step.run(`invite:${ic.email}`, async () => {
        try {
          await sendInvite(ic, ctx);
          return { sent: true };
        } catch (err) {
          captureFailure(err, {
            area: "jobs",
            tenantId: data.tenantId,
            tags: { job: "invite-send" },
          });
          log.error("invite.send.failed", {
            area: "jobs",
            tenantId: data.tenantId,
          });
          throw err;
        }
      });
    }

    log.info("invite.send.complete", {
      tenantId: data.tenantId,
      count: ctx.ics.length,
    });
    return { invited: ctx.ics.length };
  },
);
