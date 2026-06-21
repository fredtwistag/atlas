"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface SidebarDrillDecision {
  moneyLabel: string;
  oppTitle: string;
  href: string;
  ctaLabel: string;
}

export interface SidebarDrillConfig {
  backLabel: string;
  backHref: string;
  title: string;
  sections: { id: string; label: string }[];
  decision?: SidebarDrillDecision | null;
}

interface DrillContext {
  config: SidebarDrillConfig | null;
  setConfig: (config: SidebarDrillConfig | null) => void;
}

const Ctx = createContext<DrillContext>({ config: null, setConfig: () => {} });

/** Bridges a page's report-nav config up to the layout-level sidebar. */
export function SidebarDrillProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<SidebarDrillConfig | null>(null);
  const setConfig = useCallback((c: SidebarDrillConfig | null) => setConfigState(c), []);
  return <Ctx.Provider value={{ config, setConfig }}>{children}</Ctx.Provider>;
}

export function useSidebarDrill(): DrillContext {
  return useContext(Ctx);
}
