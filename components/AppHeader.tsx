"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { Avatar } from "./ui/Avatar";
import { cn } from "@/lib/cn";

/**
 * App chrome shared across the authenticated views. The persona switcher isn't
 * part of the real product (auth + JWT role decide the view) — it exists so the
 * demo is navigable across the IC, manager/sponsor, and Twistag perspectives.
 */
const PERSONAS = [
  { label: "IC", href: "/me", match: ["/me", "/session"] },
  {
    label: "Manager / Sponsor",
    href: "/sprint/spr-northwind-q2",
    match: ["/sprint"],
  },
  { label: "Twistag", href: "/twistag", match: ["/twistag"] },
];

export function AppHeader({ user }: { user: { name: string; title: string } }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Logo />

        <nav className="ml-2 hidden items-center gap-1 rounded-full border border-border bg-surface p-0.5 md:flex">
          {PERSONAS.map((p) => {
            const active = p.match.some((m) => pathname.startsWith(m));
            return (
              <Link
                key={p.label}
                href={p.href}
                className={cn(
                  "rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-text text-surface"
                    : "text-text-2 hover:text-text",
                )}
              >
                {p.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-2.5">
          <div className="hidden text-right sm:block">
            <div className="text-[13px] font-medium leading-tight">
              {user.name}
            </div>
            <div className="text-xs text-text-3">{user.title}</div>
          </div>
          <Avatar name={user.name} />
        </div>
      </div>
    </header>
  );
}
