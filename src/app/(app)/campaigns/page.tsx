import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { pageAccess } from "@/lib/auth/session";
import { getCampaignReport, type AdRowView } from "@/lib/reporting/service";
import { getFilterOptions } from "@/lib/reporting/options";
import { formatCurrency } from "@/lib/metrics/format";
import type { MetricMap } from "@/lib/metrics/compute";
import { hrefWith, type SP } from "@/lib/url";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { ReportErrorNotice, withReportErrors } from "@/components/app/report-error";
import { FilterBar } from "@/components/reports/filter-bar";
import { AttributionDisclaimer, RangeNote } from "@/components/reports/range-note";
import { MetricValue } from "@/components/reports/metric-value";
import { StatusDot } from "@/components/reports/badges";
import { CreativesTable, Pagination, SortHeader } from "@/components/reports/creatives-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Campaigns" };
const COLS = ["spend", "impressions", "reach", "ctr", "cpc", "cpm", "results", "cost_per_result", "purchases", "purchase_value", "roas", "cost_per_purchase"];

type CampaignRow = { id: string; name: string; objective: string | null; status: string | null; account: string | null; dailyBudget: number | null; lifetimeBudget: number | null; metrics: MetricMap };
type AdSetRow = { id: string; name: string; status: string | null; campaign: string | null; optimizationGoal: string | null; attribution: string | null; metrics: MetricMap };

export default function CampaignsPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <Campaigns searchParams={searchParams} />
    </Suspense>
  );
}

async function Campaigns({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await pageAccess("reports.campaigns");
  const sp = await searchParams;
  const level = sp.level === "adset" || sp.level === "ad" ? sp.level : "campaign";
  const [res, options] = await Promise.all([withReportErrors(() => getCampaignReport(ctx, sp, level)), getFilterOptions(ctx)]);
  const cols = COLS.filter((k) => ctx.metrics.has(k));

  return (
    <>
      <PageHeader title="Campaigns" description="Campaign, ad set and ad-level reporting with status, objective, optimisation event and attribution setting.">
        <FilterBar accounts={options.accounts} campaigns={options.campaigns} products={options.products} showType />
      </PageHeader>
      <div className="flex gap-1 border-b px-4 sm:px-6 lg:px-8" role="tablist">
        {(["campaign", "adset", "ad"] as const).map((l) => (
          <Link key={l} role="tab" aria-selected={level === l} href={hrefWith("/campaigns", sp, { level: l, page: null, sort: null, dir: null })} className={cn("-mb-px border-b-2 px-3 py-2.5 text-sm font-medium", level === l ? "border-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {l === "campaign" ? "Campaigns" : l === "adset" ? "Ad sets" : "Ads"}
          </Link>
        ))}
      </div>
      <PageBody>
        {!res.ok ? (
          <ReportErrorNotice message={res.message} />
        ) : (
          <>
            <RangeNote range={res.data.range} />
            <Section flush>
              {level === "ad" ? (
                <CreativesTable rows={res.data.rows as AdRowView[]} metricKeys={cols} currency={res.data.range.currency} sort={res.data.sort} dir={res.data.dir} path="/campaigns" sp={sp} />
              ) : res.data.rows.length === 0 ? (
                <p className="p-10 text-center text-sm text-muted-foreground">No delivery in this date range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[280px]">{level === "campaign" ? "Campaign" : "Ad set"}</TableHead>
                        <TableHead>{level === "campaign" ? "Objective" : "Optimisation / attribution"}</TableHead>
                        {level === "campaign" && ctx.metrics.has("spend") && <TableHead className="text-right">Budget</TableHead>}
                        {cols.map((k) => <TableHead key={k} className="text-right whitespace-nowrap"><SortHeader k={k} sort={res.data.sort} dir={res.data.dir} path="/campaigns" sp={sp} /></TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {level === "campaign"
                        ? (res.data.rows as CampaignRow[]).map((c) => (
                            <TableRow key={c.id}>
                              <TableCell>
                                <Link href={hrefWith("/campaigns", sp, { level: "adset", campaign: c.id, page: null })} className="font-medium hover:underline">{c.name}</Link>
                                <div className="flex gap-2"><StatusDot status={c.status} /><span className="text-xs text-muted-foreground">{c.account}</span></div>
                              </TableCell>
                              <TableCell className="text-xs">{(c.objective ?? "—").replace(/^OUTCOME_/, "").toLowerCase()}</TableCell>
                              {ctx.metrics.has("spend") && (
                                <TableCell className="text-right text-xs whitespace-nowrap">
                                  {c.dailyBudget !== null ? `${formatCurrency(c.dailyBudget, res.data.range.currency)}/day` : c.lifetimeBudget !== null ? `${formatCurrency(c.lifetimeBudget, res.data.range.currency)} lifetime` : "Ad set budgets"}
                                </TableCell>
                              )}
                              {cols.map((k) => <TableCell key={k} className="text-right"><MetricValue k={k} v={c.metrics[k]} currency={res.data.range.currency} /></TableCell>)}
                            </TableRow>
                          ))
                        : (res.data.rows as AdSetRow[]).map((a) => (
                            <TableRow key={a.id}>
                              <TableCell>
                                <p className="font-medium">{a.name}</p>
                                <div className="flex gap-2"><StatusDot status={a.status} /><span className="max-w-[220px] truncate text-xs text-muted-foreground">{a.campaign}</span></div>
                              </TableCell>
                              <TableCell className="text-xs">
                                <p>{(a.optimizationGoal ?? "—").toLowerCase().replace(/_/g, " ")}</p>
                                <p className="text-muted-foreground">{a.attribution ?? "attribution not reported"}</p>
                              </TableCell>
                              {cols.map((k) => <TableCell key={k} className="text-right"><MetricValue k={k} v={a.metrics[k]} currency={res.data.range.currency} /></TableCell>)}
                            </TableRow>
                          ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="border-t px-5 py-3">
                <Pagination page={res.data.page} pageSize={res.data.pageSize} total={res.data.total} path="/campaigns" sp={sp} />
              </div>
            </Section>
            <AttributionDisclaimer />
          </>
        )}
      </PageBody>
    </>
  );
}
