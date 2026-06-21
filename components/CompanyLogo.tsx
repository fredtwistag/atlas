"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { faviconUrl } from "@/lib/favicon";
import { cn } from "@/lib/cn";

const sizes = { sm: "h-6 w-6", md: "h-8 w-8", lg: "h-10 w-10" } as const;

/**
 * Company logo from the org's website favicon, with an initials fallback when
 * there's no domain or the icon fails to load. `size` keys mirror Avatar's.
 */
export function CompanyLogo({
  domain,
  name,
  size = "md",
  className,
}: {
  domain: string | null | undefined;
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const url = faviconUrl(domain);
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return <Avatar name={name} size={size} className={className} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny external favicon; next/image proxy is overkill
    <img
      src={url}
      alt=""
      width={64}
      height={64}
      className={cn(
        "shrink-0 rounded bg-surface object-contain",
        sizes[size],
        className,
      )}
      onError={() => setFailed(true)}
    />
  );
}
