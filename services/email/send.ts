import type { ReactElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";

/**
 * The single email send path for Atlas. Renders a React Email element to HTML +
 * plain text and hands it to Resend. Server-only.
 *
 * With no `RESEND_API_KEY` it no-ops: logs `[email] skipped…` and returns
 * `{ sent: false, skipped: true }`, so the app runs end-to-end in dev with zero
 * email config. When a key IS set, a real send failure THROWS — callers that
 * send inside a DB transaction (the nudge) rely on that to roll back.
 */
export type SendEmailInput = {
  to: string;
  subject: string;
  react: ReactElement;
  /** Optional Reply-To, e.g. the inviting manager. */
  replyTo?: string;
};

export type SendEmailResult =
  | { sent: true; id: string | null }
  | { sent: false; skipped: true };

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "Atlas <onboarding@resend.dev>";
}

export async function sendEmail({
  to,
  subject,
  react,
  replyTo,
}: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.info(`[email] skipped (no RESEND_API_KEY): "${subject}" → ${to}`);
    return { sent: false, skipped: true };
  }

  const [html, text] = await Promise.all([
    render(react),
    render(react, { plainText: true }),
  ]);

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: fromAddress(),
    to,
    subject,
    html,
    text,
    ...(replyTo ? { replyTo } : {}),
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
  return { sent: true, id: data?.id ?? null };
}
