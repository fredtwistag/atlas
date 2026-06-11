import type { ReactElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { log } from "@/lib/log";
import { captureFailure } from "@/lib/observability";

/**
 * The single email send path for Atlas. Renders a React Email element to HTML +
 * plain text and hands it to Resend. Server-only.
 *
 * With no `RESEND_API_KEY` it no-ops: emits a structured `email.send.skipped`
 * line and returns `{ sent: false, skipped: true }`, so the app runs end-to-end
 * in dev with zero email config. When a key IS set, a real send failure THROWS
 * — callers that send inside a DB transaction (the nudge) rely on that to roll
 * back — and is also captured to Sentry (area: email) on the way out.
 *
 * Privacy (plan 023): we log/capture NEITHER the recipient address (PII) NOR the
 * subject (can echo a person's name). Logs carry only a count/flag; Sentry gets
 * the Error + the `area` tag. No `to`/`subject` ever leaves the process.
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
    // Content-free: a count/flag, never the recipient or subject.
    log.info("email.send.skipped", { reason: "no_resend_api_key" });
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
    const failure = new Error(`Resend send failed: ${error.message}`);
    // Plain-log + Sentry capture, both content-free (Error message is Resend's
    // own status, not user content; no `to`/`subject` attached).
    log.error("email.send.failed", { area: "email" });
    captureFailure(failure, { area: "email" });
    throw failure;
  }
  return { sent: true, id: data?.id ?? null };
}
