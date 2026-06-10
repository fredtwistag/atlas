"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { Logo } from "./Logo";

/**
 * Authenticated app chrome: a fixed left navigation rail on desktop, collapsing
 * to a top bar + off-canvas drawer on mobile. Content lives full-width in the
 * second column — individual pages own their own padding/measure.
 */
export function AppShell({
  user,
  sprintId = null,
  children,
}: {
  user: { name: string; title: string };
  sprintId?: string | null;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer on route change.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[220px_1fr]">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen border-r border-border lg:block">
        <AppSidebar user={user} sprintId={sprintId} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur lg:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          className="rounded-sm p-1.5 text-text-2 hover:bg-surface-2 hover:text-text"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo />
      </div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            className="absolute inset-0 bg-text/30 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            tabIndex={-1}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="relative z-10 flex h-full w-[260px] flex-col border-r border-border shadow-lg"
          >
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-sm p-1.5 text-text-3 hover:bg-surface-2 hover:text-text"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <AppSidebar
              user={user}
              sprintId={sprintId}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* Content column */}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
