import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { pageAccess } from "@/lib/auth/session";
import { getOverview } from "@/lib/reporting/service";
import { getFilterOptions } from "@/lib/reporting/options";
import { METRIC_BY_KEY } from "@/lib/metrics/catalog";
import { filterParams, hrefWith, type SP } from "@/lib/url";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { ReportErrorNotice, withReportErrors } from "@/components/app/report-error";
import { FilterBar } from "@/components/reports/filter-bar";
import { KpiCard, MetricValue } from "@/components/reports/metric-value";
import { TrendChart } from "@/components/reports/trend-chart";
import { AttributionDisclaimer, EmptyRangeNotice, RangeNote } from "@/components/reports/range-note";
import { LowSampleBadge, SyncBadge } from "@/components/reports/badges";
import { CreativesTable } from "@/components/reports/creatives-table";
import { CreatorSearch } from "@/components/reports/creator-search";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Overview" };

const KPI_KEYS = ["spend", "purchases", "purchase_value", "roas", "cost_per_purchase", "impressions", "ctr", "cpm", "outbound_ctr", "hook_rate"];
const CHART_KEYS = ["spend", "purchases", "purchase_value", "roas", "cost_per_purchase", "impressions", "ctr", "outbound_ctr", "cpm", "thruplays", "hook_rate", "link_clicks"];
const TABLE_KEYS = ["spend", "purchases", "purchase_value", "roas", "cost_per_purchase", "ctr"];

export default function OverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<PageSkeleton kpis={8} />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await pageAccess("reports.overview");
  const sp = await searchParams;
  const [res, options] = await Promise.all([withReportErrors(() => getOverview(ctx, sp)), getFilterOptions(ctx)]);
  const allowed = (keys: string[]) => keys.filter((k) => ctx.metrics.has(k));

  return (
    <>
      <PageHeader
        title="Overview"
        description="Meta Ads performance across the ad accounts and creators you can access."
        actions={
          <>
            {ctx.permissions.has("reports.creators") && <CreatorSearch />}
            {res.ok && <SyncBadge {...res.data.sync} timeZone={res.data.range.reportingTimezone} />}
          </>
        }
      >
        <FilterBar accounts={options.accounts} campaigns={options.campaigns} products={options.products} showType showCompare />
      </PageHeader>
      <PageBody>
        {!res.ok ? (
          <ReportErrorNotice message={res.message} />
        ) : (
          <OverviewBody data={res.data} sp={sp} kpis={allowed(KPI_KEYS)} chartKeys={allowed(CHART_KEYS)} tableKeys={allowed(TABLE_KEYS)} canMap={ctx.permissions.has("mapping.manage")} canCreatives={ctx.permissions.has("reports.creatives")} />
        )}
      </PageBody>
    </>
  );
}

function OverviewBody({ data, sp, kpis, chartKeys, tableKeys, canMap, canCreatives }: { data: Awaited<ReturnType<typeof getOverview>>; sp: SP; kpis: string[]; chartKeys: string[]; tableKeys: string[]; canMap: boolean; canCreatives: boolean }) {
  const cur = data.range.currency;
  const compare = Boolean(data.previousMetrics);
  const c = data.counts;
  const rankLabel = METRIC_BY_KEY[data.creatorRanking.metric]?.label ?? data.creatorRanking.metric;
  return (
    <>
      <RangeNote range={data.range} />
      <EmptyRangeNotice range={data.range} />
      {data.sync.failing && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4" /> One or more ad accounts are failing to sync. Figures may be incomplete.
          {data.sync.accounts.length > 0 && <Link href="/ad-accounts" className="ml-auto font-medium underline">View sync status</Link>}
        </div>
      )}

      {kpis.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {kpis.map((k) => (
            <KpiCard key={k} k={k} v={data.metrics[k]} prev={data.previousMetrics?.[k]} currency={cur} showDelta={compare} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No metrics have been enabled for your account. Ask an administrator for access.</p>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Active campaigns", c.activeCampaigns],
          ["Active ad sets", c.activeAdSets],
          ["Active ads", c.activeAds],
          ["Ads in scope", c.totalAds],
          ["Mapped ads", c.mappedAds],
          ...(c.unmappedAds !== null ? [["Unmapped ads", c.unmappedAds] as const] : []),
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular">
              {label === "Unmapped ads" && canMap && Number(n) > 0 ? (
                <Link href="/creatives/mapping?status=unmapped" className="text-amber-700 hover:underline">{Number(n).toLocaleString("en-IN")}</Link>
              ) : (
                Number(n).toLocaleString("en-IN")
              )}
            </p>
          </div>
        ))}
      </div>

      <Section title="Performance trend" description="Values Meta did not report are shown as gaps, not zeros.">
        <TrendChart data={data.timeseries} metricKeys={chartKeys} defaultPrimary={chartKeys.includes("spend") ? "spend" : chartKeys[0]} defaultSecondary={chartKeys.includes("roas") ? "roas" : undefined} currency={cur} />
      </Section>

      <div className="grid gap-6 2xl:grid-cols-2">
        <Section title="Creator ranking" description={`Top creators by ${rankLabel}. Each ad counts toward exactly one creator.`} flush>
          {data.creatorRanking.rows.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead className="text-right">Ads</TableHead>
                    {tableKeys.slice(0, 4).map((k) => (
                      <TableHead key={k} className="text-right whitespace-nowrap">{METRIC_BY_KEY[k].label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.creatorRanking.rows.map((r, i) => (
                    <TableRow key={r.id ?? "unmapped"}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        {r.creator ? (
                          <Link href={hrefWith(`/creators/${r.creator.id}`, filterParams(sp), {})} className="font-medium hover:underline">{r.creator.name}</Link>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                        {r.sample.low && <span className="ml-2"><LowSampleBadge reasons={r.sample.reasons} /></span>}
                      </TableCell>
                      <TableCell className="text-right tabular">{r.adCount}</TableCell>
                      {tableKeys.slice(0, 4).map((k) => (
                        <TableCell key={k} className="text-right"><MetricValue k={k} v={r.metrics[k]} currency={cur} /></TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">No mapped creator delivery in this range.</p>
          )}
        </Section>

        <div className="min-w-0 space-y-6">
          <Section
            title="Best-performing creatives"
            description={`By ${METRIC_BY_KEY[data.bestCreatives.metric]?.label}; only creatives with ≥ ${data.thresholds.minSpend.toLocaleString("en-IN")} spend and ≥ ${data.thresholds.minPurchases} purchases qualify.`}
            actions={canCreatives ? <Link href={hrefWith("/creatives", filterParams(sp), {})} className="text-xs font-medium text-primary hover:underline">Leaderboard →</Link> : null}
            flush
          >
            <CreativesTable rows={data.bestCreatives.rows} metricKeys={tableKeys.slice(0, 3)} currency={cur} sort={data.bestCreatives.metric} dir="desc" path="/overview" sp={sp} emptyText="No creative has enough spend and purchases to rank yet." />
          </Section>
          <Section title="Weak-performing creatives" description={`Lowest ${METRIC_BY_KEY[data.weakCreatives.metric]?.label} among creatives with meaningful spend.`} flush>
            <CreativesTable rows={data.weakCreatives.rows} metricKeys={tableKeys.slice(0, 3)} currency={cur} sort={data.weakCreatives.metric} dir="asc" path="/overview" sp={sp} emptyText="No creative has enough spend to evaluate yet." />
          </Section>
        </div>
      </div>
      <AttributionDisclaimer />
    </>
  );
}
