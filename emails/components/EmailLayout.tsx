import type { ReactNode } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * Shared shell for every Atlas transactional email. Single column, max 560px,
 * white card on #fafafa, 1px borders, 8px radii, no shadows, no images. Inter /
 * system font stack only — email clients won't load webfonts. Design mirrors
 * design/tokens.css and the Linear/Vanta/Notion transactional pattern.
 */

// System/Inter stack — webfonts don't load reliably in mail clients.
const FONT =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const main = {
  backgroundColor: "#fafafa",
  fontFamily: FONT,
  margin: 0,
  padding: "32px 0",
};

const card = {
  backgroundColor: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: "8px",
  maxWidth: "560px",
  margin: "0 auto",
  padding: "32px",
};

const wordmark = {
  fontSize: "16px",
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: "#09090b",
  margin: "0 0 24px",
};

const footerStyle = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#52525b",
  maxWidth: "560px",
  margin: "16px auto 0",
  padding: "0 32px",
};

const headingStyle = {
  fontSize: "20px",
  lineHeight: "28px",
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: "#09090b",
  margin: "0 0 12px",
};

const textStyle = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#09090b",
  margin: "0 0 16px",
};

const mutedStyle = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#52525b",
  margin: "0 0 16px",
};

const buttonStyle = {
  backgroundColor: "#4f46e5",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  borderRadius: "8px",
  padding: "12px 20px",
  display: "inline-block",
};

export function EmailLayout({
  preview,
  footer,
  children,
}: {
  preview: string;
  footer: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={card}>
          <Text style={wordmark}>Atlas</Text>
          {children}
        </Container>
        <Text style={footerStyle}>{footer}</Text>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children }: { children: ReactNode }) {
  return <Heading style={headingStyle}>{children}</Heading>;
}

export function EmailText({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return <Text style={muted ? mutedStyle : textStyle}>{children}</Text>;
}

export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={{ margin: "8px 0 24px" }}>
      <Button href={href} style={buttonStyle}>
        {children}
      </Button>
    </Section>
  );
}

export { Link as EmailLink };
