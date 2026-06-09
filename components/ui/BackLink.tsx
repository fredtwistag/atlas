import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-text-2 transition-colors hover:text-text"
    >
      <ArrowLeft className="h-4 w-4" /> {children}
    </Link>
  );
}
