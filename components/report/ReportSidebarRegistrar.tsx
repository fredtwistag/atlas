"use client";

import { useEffect } from "react";
import { useSidebarDrill, type SidebarDrillConfig } from "@/components/SidebarDrillContext";

/**
 * Registers the report's drill config into the sidebar context on mount and
 * clears it on unmount (so navigating away restores the flat nav). Renders
 * nothing. The report page builds the config (sections + the recommended move).
 */
export function ReportSidebarRegistrar({ config }: { config: SidebarDrillConfig }) {
  const { setConfig } = useSidebarDrill();
  const key = JSON.stringify(config);
  useEffect(() => {
    setConfig(config);
    return () => setConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setConfig, key]);
  return null;
}
