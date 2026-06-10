import type { ReactElement } from "react";
import { createElement } from "react";
import { sendEmail } from "../services/email/send";
import { InviteEmail, inviteSubject } from "../emails/InviteEmail";
import { NudgeEmail } from "../emails/NudgeEmail";
import { appUrl } from "../lib/app-url";
import { TOPIC_TEMPLATES } from "../lib/topic-templates";

/**
 * Sends one of each Atlas transactional email to a recipient so they show up in
 * the Resend dashboard. Links are placeholders — this verifies deliverability +
 * rendering, not a working sign-in.
 *
 *   npm run email:test -- you@example.com
 *
 * Needs RESEND_API_KEY + EMAIL_FROM (on a Resend-verified domain) in .env.local.
 * Resend sandbox note: with no verified domain, EMAIL_FROM must be
 * "onboarding@resend.dev" and the recipient must be your own Resend account
 * email. Verify a domain to send elsewhere.
 */
async function main(): Promise<void> {
  const to = process.argv[2] ?? process.env.RESEND_TEST_TO;
  if (!to) {
    throw new Error(
      "Usage: tsx --env-file=.env.local scripts/send-test-emails.ts <recipient@email>",
    );
  }
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set — add it to .env.local first.");
  }

  const org = "Northwind";
  const inviter = "Marcus";
  const confirmUrl = `${appUrl()}/auth/confirm?token_hash=PREVIEW_TOKEN`;
  const topics = TOPIC_TEMPLATES.map((t) => ({
    title: t.title,
    estMinutes: t.estMinutes,
  }));

  const jobs: { label: string; subject: string; react: ReactElement }[] = [
    {
      label: "invite · ic",
      subject: inviteSubject("ic", inviter, org),
      react: createElement(InviteEmail, {
        role: "ic",
        orgName: org,
        inviterName: inviter,
        confirmUrl,
        topics,
      }),
    },
    {
      label: "invite · sponsor",
      subject: inviteSubject("sponsor", inviter, org),
      react: createElement(InviteEmail, {
        role: "sponsor",
        orgName: org,
        inviterName: inviter,
        confirmUrl,
      }),
    },
    {
      label: "invite · manager",
      subject: inviteSubject("manager", "The Atlas team", org),
      react: createElement(InviteEmail, {
        role: "manager",
        orgName: org,
        inviterName: "The Atlas team",
        confirmUrl,
      }),
    },
    {
      label: "nudge",
      subject: "A quick nudge on your Atlas sessions",
      react: createElement(NudgeEmail, {
        senderName: inviter,
        orgName: org,
        body: "Hi there,\n\nNo pressure at all — your Atlas discovery sessions are open whenever you have a spare five minutes. Thanks!",
        ctaUrl: `${appUrl()}/me`,
      }),
    },
  ];

  for (const job of jobs) {
    const result = await sendEmail({
      to,
      subject: `[Atlas test] ${job.subject}`,
      react: job.react,
    });
    // eslint-disable-next-line no-console
    console.log(`${job.label.padEnd(18)} → ${JSON.stringify(result)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
