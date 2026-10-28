import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Download } from "lucide-react";
import { pageAccess } from "@/lib/auth/session";
import { BREAKDOWN_TYPES, getBreakdown, type BreakdownKey } from "@/lib/reporting/service";
import { getFilterOptions } from "@/lib/reporting/options";
import { METRIC_BY_KEY } from "@/lib/metrics/catalog";
import { hrefWith, type SP } from "@/lib/url";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { ReportErrorNotice, withReportErrors } from "@/components/app/report-error";
import { FilterBar } from "@/components/reports/filter-bar";
import { MetricValue } from "@/components/reports/metric-value";
import { RangeNote } from "@/components/reports/range-note";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

function exportHref(kind: string, sp: SP) {
  const keep = Object.fromEntries(Object.entries(sp).filter(([k]) => !["bd", "page"].includes(k)));
  return hrefWith("/api/v1/export", keep, { kind });
}

async function Reports({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await pageAccess(["reports.export", "reports.breakdowns"]);
  const sp = await searchParams;
  const options = await getFilterOptions(ctx);
  const bd = (typeof sp.bd === "string" && sp.bd in BREAKDOWN_TYPES ? sp.bd : "AGE_GENDER") as BreakdownKey;
  const canBreakdowns = ctx.permissions.has("reports.breakdowns");
  const canExport = ctx.permissions.has("reports.export");
  const res = canBreakdowns ? await withReportErrors(() => getBreakdown(ctx, sp, bd)) : null;
  const exports = [
    { kind: "creators", label: "Creator report", desc: "One row per creator you can access.", perm: "reports.creators" },
    { kind: "creatives", label: "Creative report", desc: "One row per ad, with creator, asset and attribution.", perm: "reports.creatives" },
    { kind: "campaigns", label: "Campaign report", desc: "One row per campaign.", perm: "reports.campaigns" },
  ].filter((e) => ctx.permissions.has(e.perm as never));

  return (
    <>
      <PageHeader title="Reports" description="Exports and audience breakdowns. Everything respects your creator, account, date and metric access.">
        <FilterBar accounts={options.accounts} campaigns={options.campaigns} products={options.products} showType />
      </PageHeader>
      <PageBody>
        {canExport && (
          <Section title="CSV exports" description="Exports use the filters above, include only the metrics you can see, and are recorded in the audit log.">
            <div className="grid gap-3 md:grid-cols-3">
              {exports.map((e) => (
                <a key={e.kind} href={exportHref(e.kind, sp)} className="group rounded-lg border p-4 hover:border-primary hover:bg-accent/40" download>
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{e.label}</p>
                    <Download className="size-4 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{e.desc}</p>
                </a>
              ))}
            </div>
          </Section>
        )}
        {res && (
          <Section title="Breakdowns" description="Meta breakdowns by audience and placement. Breakdown history is kept for the window configured in Settings." flush>
            <div className="flex flex-wrap gap-1 border-b px-4 py-2">
              {(Object.keys(BREAKDOWN_TYPES) as BreakdownKey[]).map((k) => (
                <Link key={k} href={hrefWith("/reports", sp, { bd: k })} scroll={false} className={cn("rounded-md px-3 py-1.5 text-sm", bd === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{BREAKDOWN_TYPES[k].label}</Link>
              ))}
            </div>
            {!res.ok ? (
              <div className="p-4"><ReportErrorNotice message={res.message} /></div>
            ) : (
              <div className="space-y-3 p-4">
                <RangeNote range={res.data.range} />
                {res.data.rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No breakdown data synced for this range.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {BREAKDOWN_TYPES[bd].dims.map((d) => <TableHead key={d}>{d}</TableHead>)}
                          {Object.keys(res.data.rows[0].metrics).map((k) => <TableHead key={k} className="text-right whitespace-nowrap">{METRIC_BY_KEY[k].label}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {res.data.rows.map((r) => (
                          <TableRow key={`${r.dim1}|${r.dim2}`}>
                            <TableCell className="capitalize">{r.dim1.replace(/_/g, " ")}</TableCell>
                            {BREAKDOWN_TYPES[bd].dims.length > 1 && <TableCell className="capitalize">{r.dim2.replace(/_/g, " ")}</TableCell>}
                            {Object.entries(r.metrics).map(([k, v]) => <TableCell key={k} className="text-right"><MetricValue k={k} v={v} currency={res.data.range.currency} /></TableCell>)}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </Section>
        )}
      </PageBody>
    </>
  );
}
