import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

/**
 * Public marketing surface (atlas.twistag.com). `.theme-marketing` re-themes
 * the design tokens to the Twistag brand — white canvas, dirty-white
 * surfaces, black-primary actions, lime accent. The product app is untouched.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="theme-marketing bg-bg text-text">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
