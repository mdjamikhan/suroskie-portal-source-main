import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, AtSign } from "lucide-react";
import { pageAccess } from "@/lib/auth/session";
import { getCreatorPerformance } from "@/lib/reporting/service";
import { getFilterOptions } from "@/lib/reporting/options";
import { prisma } from "@/lib/db";
import { METRIC_BY_KEY } from "@/lib/metrics/catalog";
import { formatDateLabel } from "@/lib/metrics/format";
import { AppError } from "@/lib/errors";
import { filterParams, hrefWith, type SP } from "@/lib/url";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { Avatar } from "@/components/app/avatar";
import { ReportErrorNotice, withReportErrors } from "@/components/app/report-error";
import { FilterBar } from "@/components/reports/filter-bar";
import { Delta, KpiCard, MetricValue } from "@/components/reports/metric-value";
import { TrendChart } from "@/components/reports/trend-chart";
import { AttributionDisclaimer, EmptyRangeNotice, RangeNote } from "@/components/reports/range-note";
import { LowSampleBadge } from "@/components/reports/badges";
import { CreativesTable, Pagination } from "@/components/reports/creatives-table";
import { CreatorSearch } from "@/components/reports/creator-search";
import { CreatorFormDialog } from "@/components/admin/creator-form";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Creator performance" };

const KPI = ["spend", "purchases", "purchase_value", "roas", "cost_per_purchase", "impressions", "reach", "ctr", "cpc", "outbound_ctr"];
const VIDEO = ["video_3s_views", "hook_rate", "thruplays", "thruplay_rate", "video_p25", "video_p50", "video_p75", "video_p95", "video_avg_time", "cost_per_thruplay"];
const CHART = ["spend", "purchases", "purchase_value", "roas", "cost_per_purchase", "impressions", "ctr", "outbound_ctr", "thruplays", "hook_rate"];
const TABLE = ["spend", "purchases", "purchase_value", "roas", "cost_per_purchase", "impressions", "ctr", "hook_rate", "thruplays"];
const COMPARE = ["spend", "purchases", "purchase_value", "roas", "cost_per_purchase", "impressions", "ctr", "outbound_ctr", "hook_rate", "thruplays"];

export default function CreatorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<PageSkeleton kpis={10} />}>
      <CreatorReport params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CreatorReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const ctx = await pageAccess("reports.creators");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  let res;
  try {
    res = await withReportErrors(() => getCreatorPerformance(ctx, id, sp));
  } catch (e) {
    // Same response for "doesn't exist" and "not yours" so ids can't be probed.
    if (e instanceof AppError && (e.status === 403 || e.status === 404)) {
      return (
        <PageBody>
          <div className="mx-auto max-w-md py-20 text-center">
            <h1 className="text-lg font-semibold">Creator not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">This creator doesn&apos;t exist or isn&apos;t assigned to you.</p>
            <Link href="/creators" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">Back to creators</Link>
          </div>
        </PageBody>
      );
    }
    throw e;
  }
  const options = await getFilterOptions(ctx);
  if (!res.ok) return <PageBody><ReportErrorNotice message={res.message} /></PageBody>;
  const d = res.data;
  const cur = d.range.currency;
  const allowed = (ks: string[]) => ks.filter((k) => ctx.metrics.has(k));
  const canManage = ctx.permissions.has("creators.manage") && ctx.creators === "ALL";
  const owners = canManage ? await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const fp = filterParams(sp);
  const hasVideo = allowed(VIDEO).some((k) => d.metrics[k]?.s === "ok");
  const c = d.creator;

  return (
    <>
      <PageHeader
        title={c.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{c.code}</span>
            {c.instagramHandle && <span className="inline-flex items-center gap-0.5"><AtSign className="size-3.5" />{c.instagramHandle}</span>}
            {c.team && <span>{c.team}</span>}
            {c.owner && <span>Owner: {c.owner.name}</span>}
            {!c.isActive && <Badge variant="secondary">Inactive</Badge>}
            {d.sample.low && <LowSampleBadge reasons={d.sample.reasons} />}
          </span>
        }
        actions={
          <>
            <Link href={hrefWith("/creators", fp, {})} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All creators</Link>
            <CreatorSearch placeholder="Switch creator…" preserveQuery={new URLSearchParams(fp as Record<string, string>).toString()} />
            {canManage && <CreatorFormDialog initial={{ id: c.id, code: c.code, name: c.name, instagramHandle: c.instagramHandle, profileImageUrl: c.profileImageUrl, notes: c.notes, isActive: c.isActive, team: c.team, ownerUserId: c.ownerUserId }} owners={owners} />}
          </>
        }
      >
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={c.name} url={c.profileImageUrl} size={44} />
          {c.notes && <p className="max-w-2xl text-sm text-muted-foreground">{c.notes}</p>}
        </div>
        <FilterBar accounts={options.accounts} campaigns={options.campaigns} products={options.products} showType />
      </PageHeader>
      <PageBody>
        <RangeNote range={d.range} />
        <EmptyRangeNotice range={d.range} />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {allowed(KPI).map((k) => <KpiCard key={k} k={k} v={d.metrics[k]} prev={d.previousMetrics[k]} currency={cur} showDelta />)}
        </div>

        <Section title="Daily performance">
          <TrendChart data={d.timeseries} metricKeys={allowed(CHART)} defaultPrimary={ctx.metrics.has("purchase_value") ? "purchase_value" : allowed(CHART)[0]} defaultSecondary={ctx.metrics.has("roas") ? "roas" : undefined} currency={cur} />
        </Section>

        <div className="grid gap-6 2xl:grid-cols-2">
          <Section title="Period comparison" description={`${formatDateLabel(d.range.from)} – ${formatDateLabel(d.range.to)} vs ${formatDateLabel(d.previousRange.from)} – ${formatDateLabel(d.previousRange.to)}`} flush>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">This period</TableHead>
                  <TableHead className="text-right">Previous period</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allowed(COMPARE).map((k) => (
                  <TableRow key={k}>
                    <TableCell>{METRIC_BY_KEY[k].label}</TableCell>
                    <TableCell className="text-right"><MetricValue k={k} v={d.metrics[k]} currency={cur} /></TableCell>
                    <TableCell className="text-right"><MetricValue k={k} v={d.previousMetrics[k]} currency={cur} /></TableCell>
                    <TableCell className="text-right"><Delta k={k} current={d.metrics[k]} previous={d.previousMetrics[k]} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
          {hasVideo && (
            <Section title="Video engagement" description="Only video creatives contribute; image and carousel ads show as not applicable.">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {allowed(VIDEO).map((k) => (
                  <div key={k}>
                    <p className="text-xs text-muted-foreground">{METRIC_BY_KEY[k].label}</p>
                    <p className="text-lg font-semibold"><MetricValue k={k} v={d.metrics[k]} currency={cur} /></p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        <div className="grid gap-6 2xl:grid-cols-2">
          <Section title="Best-performing creatives" description={`Highest ${METRIC_BY_KEY[d.best.metric]?.label} with meaningful spend`} flush>
            <CreativesTable rows={d.best.rows} metricKeys={allowed(TABLE).slice(0, 4)} currency={cur} sort={d.best.metric} dir="desc" path={`/creators/${c.id}`} sp={sp} showCreator={false} emptyText="No creative has enough spend to rank yet." />
          </Section>
          <Section title="Lowest-performing creatives" description={`Lowest ${METRIC_BY_KEY[d.lowest.metric]?.label} with meaningful spend`} flush>
            <CreativesTable rows={d.lowest.rows} metricKeys={allowed(TABLE).slice(0, 4)} currency={cur} sort={d.lowest.metric} dir="asc" path={`/creators/${c.id}`} sp={sp} showCreator={false} emptyText="No creative has enough spend to rank yet." />
          </Section>
        </div>

        <Section title="All creatives" description="Every ad mapped to this creator. Click a column to sort." flush>
          <CreativesTable rows={d.creatives.rows} metricKeys={allowed(TABLE)} currency={cur} sort={d.creatives.sort} dir={d.creatives.dir} path={`/creators/${c.id}`} sp={sp} showCreator={false} />
          <div className="border-t px-5 py-3">
            <Pagination page={d.creatives.page} pageSize={d.creatives.pageSize} total={d.creatives.total} path={`/creators/${c.id}`} sp={sp} />
          </div>
        </Section>

        {c.assets.length > 0 && (
          <Section title="Creative assets" description="Internal asset records for this creator." flush>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Angle</TableHead>
                  <TableHead>Hook</TableHead>
                  <TableHead>Launched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.assets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell className="text-xs">{a.creativeType.toLowerCase()}</TableCell>
                    <TableCell>{a.product ?? "—"}</TableCell>
                    <TableCell>{a.contentAngle ?? "—"}</TableCell>
                    <TableCell className="max-w-[260px] truncate" title={a.hook ?? ""}>{a.hook ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{a.launchDate ? formatDateLabel(a.launchDate.toISOString().slice(0, 10)) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        )}
        <AttributionDisclaimer />
      </PageBody>
    </>
  );
}
