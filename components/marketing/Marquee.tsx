/**
 * Full-bleed ticker band — twistag.com's signature kinetic move, recast
 * with product-native content (ranked-finding fragments instead of
 * "SELECTED WORK"). Pure CSS loop, duplicated track for seamlessness,
 * edge-masked, paused under reduced motion.
 */
const ITEMS = [
  "8.4 · RUSH-ORDER INTAKE · $340–520K/YR",
  "7.6 · SPREADSHEET HANDOFF · $180–310K/YR",
  "6.8 · SUPPLIER FOLLOW-UPS · $90–150K/YR",
  "6.1 · DELIVERY-DATE PROMISES · $60–120K/YR",
];

function Track() {
  return (
    <span className="inline-flex items-baseline">
      {ITEMS.map((item) => (
        <span key={item} className="inline-flex items-baseline">
          <span className="px-6 text-[clamp(40px,6vw,88px)] font-semibold uppercase leading-none tracking-[-0.03em] text-text">
            {item}
          </span>
          <span
            aria-hidden
            className="h-[clamp(14px,2vw,28px)] w-[clamp(14px,2vw,28px)] translate-y-[-0.2em] bg-accent"
          />
        </span>
      ))}
    </span>
  );
}

export function Marquee() {
  return (
    <div
      className="mk-marquee border-t border-border-strong bg-bg py-8 sm:py-10"
      role="marquee"
      aria-label="Example ranked findings from Atlas sprints (demo data)"
    >
      <div className="mk-marquee-track">
        <Track />
        <span aria-hidden>
          <Track />
        </span>
      </div>
    </div>
  );
}
