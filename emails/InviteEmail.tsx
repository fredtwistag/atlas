import { Section } from "@react-email/components";
import {
  EmailLayout,
  EmailHeading,
  EmailText,
  EmailButton,
} from "./components/EmailLayout";

export type InviteRole = "ic" | "sponsor" | "manager";

export interface InviteEmailProps {
  role: InviteRole;
  orgName: string;
  inviterName: string;
  /** The /auth/confirm URL whose button POSTs the verification. */
  confirmUrl: string;
  /** IC only: a preview of the topics they'll be asked about. */
  topics?: { title: string; estMinutes: number }[];
}

/** Subject line per role. Kept next to the template so copy stays in one place. */
export function inviteSubject(
  role: InviteRole,
  inviterName: string,
  orgName: string,
): string {
  switch (role) {
    case "ic":
      return `${inviterName} added you to Atlas — 4 short conversations, ~5 minutes each`;
    case "sponsor":
      return `You're the sponsor for ${orgName}'s discovery sprint`;
    case "manager":
      return `Your Atlas workspace for ${orgName} is ready`;
  }
}

function footerFor(props: InviteEmailProps): string {
  switch (props.role) {
    case "ic":
      return `You're receiving this because ${props.inviterName} added you to Atlas for ${props.orgName}.`;
    case "sponsor":
      return `You're receiving this because ${props.inviterName} added you as the sponsor for ${props.orgName}'s discovery sprint.`;
    case "manager":
      return `You're receiving this because an Atlas workspace was created for ${props.orgName}.`;
  }
}

const listItem = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#09090b",
  margin: "0 0 6px",
};

/**
 * One invite template; the `role` prop selects the copy. The CTA always links to
 * `confirmUrl`. ICs additionally get a time estimate, the privacy promise, and
 * an optional topic preview.
 */
export function InviteEmail(props: InviteEmailProps) {
  const { role, orgName, inviterName, confirmUrl, topics } = props;

  if (role === "ic") {
    return (
      <EmailLayout preview={inviteSubject("ic", inviterName, orgName)} footer={footerFor(props)}>
        <EmailHeading>{inviterName} added you to Atlas</EmailHeading>
        <EmailText>
          {inviterName} added you to a short discovery sprint for {orgName}.
          Atlas is how Twistag maps the way your team actually works — through
          conversation, not workshops.
        </EmailText>
        <EmailText muted>
          It&apos;s 4 short conversations over the next 3 weeks, on your own
          schedule — about 5 minutes each.
        </EmailText>
        <EmailText muted>
          What you say is attributed by role, never by name, in anything your
          manager or sponsor sees. You can edit or remove anything you said for 7
          days after each session.
        </EmailText>
        {topics && topics.length > 0 && (
          <Section style={{ margin: "0 0 16px" }}>
            <EmailText muted>What we&apos;ll cover:</EmailText>
            {topics.map((t) => (
              <p key={t.title} style={listItem}>
                {`• ${t.title} — about ${t.estMinutes} min`}
              </p>
            ))}
          </Section>
        )}
        <EmailButton href={confirmUrl}>Open Atlas</EmailButton>
      </EmailLayout>
    );
  }

  if (role === "sponsor") {
    return (
      <EmailLayout preview={inviteSubject("sponsor", inviterName, orgName)} footer={footerFor(props)}>
        <EmailHeading>
          You&apos;re the sponsor for {orgName}&apos;s discovery sprint
        </EmailHeading>
        <EmailText>
          {inviterName} set up a discovery sprint for {orgName} and named you its
          sponsor. When it wraps, you&apos;ll get a ranked, evidence-backed
          report of where the team&apos;s time goes and what&apos;s worth fixing.
        </EmailText>
        <EmailText muted>
          Expect 5-10 opportunities surfaced, 1-3 of them high-impact — each one
          clicks through to the quotes behind it.
        </EmailText>
        <EmailText>
          Approving an opportunity hands it to the Twistag engagement team with a
          pre-drafted scope, so the build can start within days.
        </EmailText>
        <EmailButton href={confirmUrl}>View the report</EmailButton>
      </EmailLayout>
    );
  }

  return (
    <EmailLayout preview={inviteSubject("manager", inviterName, orgName)} footer={footerFor(props)}>
      <EmailHeading>Your Atlas workspace for {orgName} is ready</EmailHeading>
      <EmailText>
        Your Atlas workspace for {orgName} is set up. Here&apos;s how to get a
        discovery sprint running:
      </EmailText>
      <Section style={{ margin: "0 0 16px" }}>
        <p style={listItem}>
          1. Invite your team — the people whose work the sprint will cover.
        </p>
        <p style={listItem}>
          2. Send them the heads-up message so the Atlas email isn&apos;t a
          surprise.
        </p>
        <p style={listItem}>
          3. Launch your sprint — everyone gets their own short sessions.
        </p>
      </Section>
      <EmailButton href={confirmUrl}>Set up your sprint</EmailButton>
    </EmailLayout>
  );
}
