import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { pageAccess } from "@/lib/auth/session";
import { compareEntities, type AdRowView } from "@/lib/reporting/service";
import { METRICS } from "@/lib/metrics/catalog";
import { numericValue } from "@/lib/metrics/compute";
import { filterParams, type SP } from "@/lib/url";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { ReportErrorNotice, withReportErrors } from "@/components/app/report-error";
import { FilterBar } from "@/components/reports/filter-bar";
import { AttributionDisclaimer, RangeNote } from "@/components/reports/range-note";
import { MetricValue } from "@/components/reports/metric-value";
import { LowSampleBadge } from "@/components/reports/badges";
import { Thumb } from "@/components/reports/creatives-table";
import { CreativesTabs } from "@/components/reports/creatives-tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Compare creatives" };

export default function ComparePage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <Compare searchParams={searchParams} />
    </Suspense>
  );
}

async function Compare({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await pageAccess("reports.creatives");
  const sp = await searchParams;
  const raw = sp.ids;
  const ids = (Array.isArray(raw) ? raw : raw ? raw.split(",") : []).filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s));
  const res = await withReportErrors(() => compareEntities(ctx, sp, "ad", ids));
  const fpQuery = new URLSearchParams(filterParams(sp) as Record<string, string>).toString();
  const metricKeys = METRICS.map((m) => m.key).filter((k) => ctx.metrics.has(k));

  return (
    <>
      <PageHeader title="Compare creatives" description="Side-by-side Meta-attributed results for the same date range.">
        <FilterBar />
      </PageHeader>
      <CreativesTabs active="compare" canReport canMap={ctx.permissions.has("mapping.manage")} query={fpQuery ? `?${fpQuery}` : ""} />
      <PageBody>
        {!res.ok ? (
          <ReportErrorNotice message={res.message} />
        ) : res.data.rows.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Select up to six creatives on the <Link className="text-primary underline" href={`/creatives${fpQuery ? `?${fpQuery}` : ""}`}>leaderboard</Link> and choose “Compare selected”.
          </div>
        ) : (
          <>
            <RangeNote range={res.data.range} />
            {(res.data.rows as AdRowView[]).some((r) => r.sample.low) && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Some creatives have small samples. Differences between them may be noise rather than real performance gaps.</p>
            )}
            <Section flush>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 min-w-[200px] bg-card">Metric</TableHead>
                      {(res.data.rows as AdRowView[]).map((r) => (
                        <TableHead key={r.id} className="min-w-[200px] align-top">
                          <div className="flex items-start gap-2 py-2">
                            <Thumb url={r.thumbnailUrl} type={r.creativeType} size={36} />
                            <div className="min-w-0 whitespace-normal">
                              <p className="line-clamp-2 font-medium text-foreground">{r.name}</p>
                              <p className="text-xs font-normal">{r.creator?.name ?? "Unmapped"}</p>
                              {r.sample.low && <LowSampleBadge reasons={r.sample.reasons} />}
                            </div>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metricKeys.map((k) => {
                      const def = METRICS.find((m) => m.key === k)!;
                      const vals = (res.data.rows as AdRowView[]).map((r) => numericValue(r.metrics[k]));
                      const nums = vals.filter((v): v is number => v !== null);
                      const best = nums.length > 1 ? (def.higherIsBetter ? Math.max(...nums) : Math.min(...nums)) : null;
                      return (
                        <TableRow key={k}>
                          <TableCell className="sticky left-0 bg-card text-muted-foreground">{def.label}</TableCell>
                          {(res.data.rows as AdRowView[]).map((r, i) => (
                            <TableCell key={r.id} className={vals[i] !== null && vals[i] === best ? "font-semibold text-positive" : ""}>
                              <MetricValue k={k} v={r.metrics[k]} currency={res.data.range.currency} />
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Section>
            <AttributionDisclaimer />
          </>
        )}
      </PageBody>
    </>
  );
}
