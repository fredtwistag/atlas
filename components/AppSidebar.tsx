"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Users,
  Bell,
  Layers,
  Lightbulb,
  BarChart3,
  Boxes,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./Logo";
import { Avatar } from "./ui/Avatar";
import { cn } from "@/lib/cn";
import { signOut } from "@/app/sign-in/actions";

/**
 * Persona switcher — not part of the real product (auth + JWT role decide the
 * view). It exists so the demo is navigable across the IC, manager/sponsor, and
 * Twistag perspectives. Each persona owns its own nav information architecture.
 */
type Persona = {
  id: string;
  short: string;
  home: string;
  match: string[];
  groups: NavGroup[];
};

type NavGroup = { label: string; items: NavItem[] };
type NavItem = {
  label: string;
  icon: LucideIcon;
  href?: string;
  match?: string[];
  count?: number;
  alert?: boolean;
};

/**
 * Build the persona nav for the tenant's current sprint id (null when there's
 * no active sprint — the manager then sees Overview, which routes to the launch
 * form). Only real, working routes are linked.
 */
function buildPersonas(sprintId: string | null): Persona[] {
  const sprintItems: NavItem[] = [
    {
      label: "Overview",
      icon: LayoutDashboard,
      href: "/sprint",
      match: ["/sprint"],
    },
  ];
  if (sprintId) {
    sprintItems.push({
      label: "Report",
      icon: FileText,
      href: `/sprint/${sprintId}/report`,
      match: [`/sprint/${sprintId}/report`],
    });
  }

  return [
    {
      id: "IC",
      short: "IC",
      home: "/me",
      match: ["/me", "/session"],
      groups: [
        {
          label: "Your sprint",
          items: [
            {
              label: "My sessions",
              icon: MessageSquare,
              href: "/me",
              match: ["/me", "/session"],
            },
          ],
        },
      ],
    },
    {
      id: "Manager",
      short: "Manager",
      home: "/sprint",
      match: ["/sprint", "/team"],
      groups: [
        { label: "Sprint", items: sprintItems },
        {
          label: "Team",
          items: [
            {
              label: "Participants",
              icon: Users,
              href: "/team",
              match: ["/team"],
            },
          ],
        },
      ],
    },
    {
      id: "Twistag",
      short: "Twistag",
      home: "/twistag",
      match: ["/twistag"],
      groups: [
        {
          label: "Workspace",
          items: [
            {
              label: "All clients",
              icon: Boxes,
              href: "/twistag",
              match: ["/twistag"],
              count: 12,
            },
            { label: "Opportunities", icon: Lightbulb, count: 47 },
            { label: "Engagements", icon: Layers, count: 8 },
            { label: "Pattern library", icon: Boxes, count: 19 },
          ],
        },
        {
          label: "Alerts",
          items: [{ label: "Needs attention", icon: Bell, alert: true }],
        },
        {
          label: "Reporting",
          items: [{ label: "Portfolio metrics", icon: BarChart3 }],
        },
      ],
    },
  ];
}

function activePersona(personas: Persona[], pathname: string): Persona {
  return (
    personas.find((p) => p.match.some((m) => pathname.startsWith(m))) ??
    personas[0]
  );
}

/** How specifically this item matches the path; -1 = no match, higher = better. */
function matchScore(item: NavItem, pathname: string): number {
  if (!item.match) return -1;
  let best = -1;
  for (const m of item.match) {
    if (pathname === m || pathname.startsWith(m + "/")) {
      best = Math.max(best, m.length);
    }
  }
  return best;
}

/**
 * The single most-specific item wins, so a sub-route like `/sprint/x/report`
 * lights up "Report" without also lighting up the broader "Overview".
 */
function activeItem(persona: Persona, pathname: string): NavItem | null {
  let winner: NavItem | null = null;
  let winnerScore = -1;
  for (const group of persona.groups) {
    for (const item of group.items) {
      const score = matchScore(item, pathname);
      if (score > winnerScore) {
        winner = item;
        winnerScore = score;
      }
    }
  }
  return winner;
}

/**
 * Left navigation rail. Presentational: `onNavigate` lets the mobile drawer
 * close itself when a link is tapped.
 */
export function AppSidebar({
  user,
  sprintId = null,
  onNavigate,
}: {
  user: { name: string; title: string };
  sprintId?: string | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const personas = buildPersonas(sprintId);
  const persona = activePersona(personas, pathname);
  const active = activeItem(persona, pathname);

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="px-4 pb-3 pt-4">
        <Logo />
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {persona.groups.map((group) => (
          <div key={group.label}>
            <div className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-3">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item === active;
                const content = (
                  <>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.count != null ? (
                      <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-text-3">
                        {item.count}
                      </span>
                    ) : null}
                    {item.alert ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                    ) : null}
                  </>
                );

                const base =
                  "flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors";

                // Items without an href are demo placeholders — rendered muted
                // and non-interactive rather than as dead links.
                if (!item.href) {
                  return (
                    <div
                      key={item.label}
                      className={cn(base, "cursor-default text-text-faint")}
                      aria-disabled
                    >
                      {content}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      base,
                      isActive
                        ? "bg-surface-2 text-text"
                        : "text-text-2 hover:bg-surface-2 hover:text-text",
                    )}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="mt-auto flex items-center gap-2.5 border-t border-border px-4 py-3">
        <Avatar name={user.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">
            {user.name}
          </div>
          <div className="truncate text-xs text-text-3">{user.title}</div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            onClick={onNavigate}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-sm p-1.5 text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
