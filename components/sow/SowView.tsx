import { Badge } from "@/components/ui/Badge";
import { BackLink } from "@/components/ui/BackLink";
import { PageContainer } from "@/components/ui/PageContainer";
import { Field, ListField } from "@/components/ui/DetailField";
import { moneyShort, type Currency } from "@/lib/format";
import type { SowDetail } from "@/lib/types";

/**
 * Read-only SOW draft view for the Twistag admin. Renders the same fields the
 * sponsor sees in the approve sheet, as a standalone page.
 */
export function SowView({
  sow,
  opportunityTitle,
  currency,
  backHref,
  backLabel = "Back to opportunity",
}: {
  sow: SowDetail;
  opportunityTitle: string;
  currency: Currency;
  backHref: string;
  backLabel?: string;
}) {
  return (
    <PageContainer>
      <div className="mb-5">
        <BackLink href={backHref}>{backLabel}</BackLink>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
            Auto-drafted SOW · {opportunityTitle}
          </div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
            {sow.title}
          </h1>
        </div>
        <Badge tone="outline">SOW · {sow.status}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Field label="Scope" value={sow.scope} multiline />
          <ListField label="Inclusions" items={sow.inclusions} tone="success" />
          <ListField label="Exclusions" items={sow.exclusions} tone="neutral" />
          <ListField
            label="Success metrics"
            items={sow.successMetrics}
            tone="brand"
          />
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Duration" value={`${sow.durationWeeks} weeks`} />
            <Field
              label="Indicative price (draft)"
              value={moneyShort(sow.priceUsd, currency).replace("K", ",000")}
            />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
              Team
            </div>
            <div className="space-y-1.5">
              {sow.team.map((t) => (
                <div
                  key={t.role}
                  className="flex items-center justify-between rounded border border-border bg-bg px-3 py-2 text-sm"
                >
                  <span className="font-medium">{t.role}</span>
                  <span className="text-text-3">{t.allocation}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs leading-relaxed text-text-3">
            Read-only Twistag view. The SOW is drafted from the
            opportunity&apos;s evidence; the client&apos;s sponsor or manager
            approves it.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}
