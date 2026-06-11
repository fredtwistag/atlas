import Link from "next/link";
import { Logo } from "@/components/Logo";
import {
  TWISTAG_URL,
  TWISTAG_ABOUT_URL,
  TWISTAG_CASE_STUDIES_URL,
  TWISTAG_CONTACT_URL,
  TWISTAG_PRIVACY_URL,
  TWISTAG_TERMS_URL,
} from "@/components/marketing/constants";

const columns: [string, [string, string, boolean?][]][] = [
  [
    "Product",
    [
      ["How it works", "/#how"],
      ["Who it's for", "/#for-who"],
      ["What you get", "/#what-you-get"],
      ["Pricing", "/pricing"],
      ["Sign in", "/me"],
    ],
  ],
  [
    "Twistag",
    [
      ["About Twistag", TWISTAG_ABOUT_URL, true],
      ["Case studies", TWISTAG_CASE_STUDIES_URL, true],
      ["Contact", TWISTAG_CONTACT_URL, true],
    ],
  ],
  [
    "Legal",
    [
      ["Privacy", TWISTAG_PRIVACY_URL, true],
      ["Terms", TWISTAG_TERMS_URL, true],
    ],
  ],
];

/** Black footer band — twistag.com anatomy: a place, not a link dump. */
export function MarketingFooter() {
  const linkClass =
    "mk-underline flex h-[36px] w-fit items-center text-[14px] text-white/65 transition-colors hover:text-white";
  return (
    <footer className="bg-[#0a0a0a] px-[5%] pb-10 pt-16 text-white">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-14 grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <span
              aria-hidden
              className="mb-5 block h-9 w-9 bg-accent"
              title="Twistag"
            />
            <Logo invert />
            <p className="mt-4 max-w-[280px] text-[13.5px] leading-relaxed text-white/65">
              An operational discovery sprint. Built by Twistag for operators,
              portcos, and partners that need to ship.
            </p>
            <a
              href={TWISTAG_URL}
              target="_blank"
              rel="noreferrer"
              className="mk-underline mt-3 inline-flex h-[36px] items-center text-[13.5px] font-medium text-white/85 hover:text-white"
            >
              twistag.com
            </a>
          </div>
          {columns.map(([heading, items]) => (
            <div key={heading}>
              <h5 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-white/45">
                {heading}
              </h5>
              {items.map(([label, href, external]) =>
                external ? (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={linkClass}
                  >
                    {label}
                  </a>
                ) : (
                  <Link key={label} href={href} className={linkClass}>
                    {label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-7 font-mono text-[11px] uppercase tracking-[0.06em] text-white/45">
          <span>© 2026 Twistag — Atlas is a product of Twistag</span>
          <span>Made in Lisbon · GDPR compliant</span>
        </div>
      </div>
    </footer>
  );
}
