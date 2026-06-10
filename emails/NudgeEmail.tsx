import { Fragment } from "react";
import {
  EmailLayout,
  EmailText,
  EmailButton,
} from "./components/EmailLayout";

export interface NudgeEmailProps {
  /** The manager who wrote and sent the nudge. */
  senderName: string;
  orgName: string;
  /** Manager-drafted message body; may contain blank-line paragraph breaks. */
  body: string;
  /** Where the CTA points — the IC's sessions page (/me). */
  ctaUrl: string;
}

function paragraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * A manager's reminder to a participant. The body is drafted in the app
 * (NudgeComposer) and passed through verbatim; the layout adds the sender
 * attribution, a CTA to the sessions page, and the privacy footer. No quotes or
 * captures are ever included — that promise is in the footer.
 */
export function NudgeEmail({ senderName, orgName, body, ctaUrl }: NudgeEmailProps) {
  return (
    <EmailLayout
      preview={`A nudge from ${senderName}`}
      footer="Atlas never includes what you said in emails to your manager."
    >
      {paragraphs(body).map((para, i) => (
        <EmailText key={i}>
          {para.split("\n").map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </EmailText>
      ))}
      <EmailText muted>
        — {senderName}, {orgName}
      </EmailText>
      <EmailButton href={ctaUrl}>Open your sessions</EmailButton>
    </EmailLayout>
  );
}
