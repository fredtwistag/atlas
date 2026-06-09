import { cn } from "@/lib/cn";

/** Deterministic soft background from a name, so avatars are stable across renders. */
function hueFrom(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const sizes = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-[11px]",
  lg: "h-10 w-10 text-[13px]",
};

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const h = hueFrom(name);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        sizes[size],
        className,
      )}
      style={{
        background: `hsl(${h} 60% 94%)`,
        color: `hsl(${h} 45% 38%)`,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
