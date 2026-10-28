import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { pageAccess } from "@/lib/auth/session";
import { getCreatives, type AdRowView } from "@/lib/reporting/service";
import { getFilterOptions } from "@/lib/reporting/options";
import { METRIC_BY_KEY } from "@/lib/metrics/catalog";
import { filterParams, hrefWith, type SP } from "@/lib/url";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { ReportErrorNotice, withReportErrors } from "@/components/app/report-error";
import { FilterBar } from "@/components/reports/filter-bar";
import { AttributionDisclaimer, EmptyRangeNotice, RangeNote } from "@/components/reports/range-note";
import { CreativesTable, Pagination } from "@/components/reports/creatives-table";
import { CreativesTabs } from "@/components/reports/creatives-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Creatives" };
const COLS = ["spend", "purchases", "purchase_value", "roas", "cost_per_purchase", "impressions", "outbound_ctr", "hook_rate", "thruplay_rate"];

export default function CreativesPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <Leaderboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Leaderboard({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await pageAccess(["reports.creatives", "mapping.manage"]);
  if (!ctx.permissions.has("reports.creatives")) redirect("/creatives/mapping");
  const sp = await searchParams;
  const [res, options] = await Promise.all([withReportErrors(() => getCreatives(ctx, sp, "ad")), getFilterOptions(ctx)]);
  const cols = COLS.filter((k) => ctx.metrics.has(k));
  const fpQuery = new URLSearchParams(filterParams(sp) as Record<string, string>).toString();

  return (
    <>
      <PageHeader title="Creatives" description="Rank and compare creatives on Meta-attributed results. Small samples are flagged and excluded by the thresholds below.">
        <FilterBar accounts={options.accounts} campaigns={options.campaigns} products={options.products} showType />
      </PageHeader>
      <CreativesTabs active="leaderboard" canReport canMap={ctx.permissions.has("mapping.manage")} query={fpQuery ? `?${fpQuery}` : ""} />
      <PageBody>
        {!res.ok ? (
          <ReportErrorNotice message={res.message} />
        ) : (
          <>
            <RangeNote range={res.data.range} />
            <EmptyRangeNotice range={res.data.range} />
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Rank by</p>
                <div className="flex flex-wrap gap-2">
                  {res.data.criteria.map((c) => (
                    <Link
                      key={c.key}
                      href={hrefWith("/creatives", sp, { sort: c.key, dir: METRIC_BY_KEY[c.key].higherIsBetter ? "desc" : "asc", page: null })}
                      className={cn("rounded-full border px-3 py-1 text-sm", res.data.sort === c.key ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              </div>
              <form className="flex flex-wrap items-end gap-2" action="/creatives">
                {Object.entries(sp).map(([k, v]) => (typeof v === "string" && !["minSpend", "minPurchases", "page"].includes(k) ? <input key={k} type="hidden" name={k} value={v} /> : null))}
                <div className="space-y-1">
                  <Label htmlFor="minSpend" className="text-[11px] uppercase tracking-wide text-muted-foreground">Min. spend ({res.data.range.currency})</Label>
                  <Input id="minSpend" name="minSpend" type="number" min={0} step="any" defaultValue={res.data.thresholds.minSpend} className="h-9 w-36" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="minPurchases" className="text-[11px] uppercase tracking-wide text-muted-foreground">Min. purchases</Label>
                  <Input id="minPurchases" name="minPurchases" type="number" min={0} step="1" defaultValue={res.data.thresholds.minPurchases} className="h-9 w-32" />
                </div>
                <Button type="submit" variant="outline" size="sm" className="h-9">Apply thresholds</Button>
              </form>
            </div>
            {(res.data.thresholds.minSpend === 0 || res.data.thresholds.minPurchases === 0) && ["roas", "cost_per_purchase"].includes(res.data.sort) && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="size-4" /> With thresholds at zero, an ad with tiny spend and a single purchase can top a ratio ranking. Treat those results as inconclusive.
              </div>
            )}
            <Section
              title={`Leaderboard · ${METRIC_BY_KEY[res.data.sort]?.label ?? res.data.sort}`}
              description="Tick creatives to compare them side by side."
              actions={
                <form id="compare-form" action="/creatives/compare" className="flex items-center gap-2">
                  {Object.entries(filterParams(sp)).map(([k, v]) => (typeof v === "string" ? <input key={k} type="hidden" name={k} value={v} /> : null))}
                  <Button type="submit" size="sm" variant="outline">Compare selected</Button>
                </form>
              }
              flush
            >
              <CreativesTable rows={res.data.rows as AdRowView[]} metricKeys={cols} currency={res.data.range.currency} sort={res.data.sort} dir={res.data.dir} path="/creatives" sp={sp} compareSelectable emptyText="No creatives meet the thresholds in this date range. Lower the thresholds or widen the range." />
              <div className="border-t px-5 py-3">
                <Pagination page={res.data.page} pageSize={res.data.pageSize} total={res.data.total} path="/creatives" sp={sp} />
              </div>
            </Section>
            <AttributionDisclaimer />
          </>
        )}
      </PageBody>
    </>
  );
}
