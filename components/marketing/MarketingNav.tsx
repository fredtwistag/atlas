import Link from "next/link";
import { Logo } from "@/components/Logo";
import { TwistagMark } from "@/components/marketing/TwistagMark";
import { Cta } from "@/components/marketing/Cta";
import { BOOKING_URL } from "@/components/marketing/constants";

const links = [
  ["How it works", "/#how"],
  ["Who it's for", "/#for-who"],
  ["What you get", "/#what-you-get"],
  ["Pricing", "/pricing"],
] as const;

/** Sticky marketing nav shared by all public pages. */
export function MarketingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border-strong bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-[64px] max-w-[1500px] items-center gap-6 px-[5%]">
        <div className="flex items-center gap-3">
          <Logo />
          <span aria-hidden className="h-4 w-px bg-border-strong" />
          <TwistagMark />
        </div>
        <div className="hidden gap-7 lg:flex">
          {links.map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className="mk-underline flex h-[44px] items-center text-[14px] font-medium text-text-2 transition-colors hover:text-text"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-4">
          <Link
            href="/me"
            className="mk-underline hidden h-[44px] items-center text-[14px] font-medium text-text-2 transition-colors hover:text-text sm:flex"
          >
            Sign in
          </Link>
          <Cta href={BOOKING_URL} target="_blank" rel="noreferrer">
            <span className="sm:hidden">Book a call</span>
            <span className="hidden sm:inline">Book a discovery call</span>
          </Cta>
        </div>
      </div>
    </nav>
  );
}
