import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { pageAccess } from "@/lib/auth/session";
import { listCreators } from "@/lib/reporting/service";
import { getFilterOptions } from "@/lib/reporting/options";
import { prisma } from "@/lib/db";
import { METRIC_BY_KEY } from "@/lib/metrics/catalog";
import { filterParams, hrefWith, type SP } from "@/lib/url";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { ReportErrorNotice, withReportErrors } from "@/components/app/report-error";
import { FilterBar } from "@/components/reports/filter-bar";
import { MetricValue } from "@/components/reports/metric-value";
import { RangeNote } from "@/components/reports/range-note";
import { Pagination } from "@/components/reports/creatives-table";
import { CreatorFormDialog } from "@/components/admin/creator-form";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/app/avatar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Creators" };
const COLS = ["spend", "purchases", "purchase_value", "roas", "cost_per_purchase", "impressions", "ctr", "thruplays"];

export default function CreatorsPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <Creators searchParams={searchParams} />
    </Suspense>
  );
}

async function Creators({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await pageAccess("reports.creators");
  const sp = await searchParams;
  const [res, options] = await Promise.all([withReportErrors(() => listCreators(ctx, sp)), getFilterOptions(ctx)]);
  const canManage = ctx.permissions.has("creators.manage") && ctx.creators === "ALL";
  const owners = canManage ? await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const cols = COLS.filter((k) => ctx.metrics.has(k));
  const q = typeof sp.q === "string" ? sp.q : "";

  return (
    <>
      <PageHeader
        title="Creators"
        description={ctx.creators === "ALL" ? "All creators and their Meta-attributed performance." : "The creators you have been given access to."}
        actions={canManage ? <CreatorFormDialog owners={owners} /> : null}
      >
        <div className="flex flex-wrap items-end gap-3">
          <form className="flex items-end gap-2" action="/creators">
            {Object.entries(filterParams(sp)).map(([k, v]) => (typeof v === "string" ? <input key={k} type="hidden" name={k} value={v} /> : null))}
            <Input name="q" defaultValue={q} placeholder="Search name, creator ID or @handle" className="h-9 w-72 bg-background" aria-label="Search creators" />
            <Button type="submit" size="sm" variant="outline" className="h-9">Search</Button>
          </form>
          <FilterBar accounts={options.accounts} products={options.products} />
        </div>
      </PageHeader>
      <PageBody>
        {!res.ok ? (
          <ReportErrorNotice message={res.message} />
        ) : (
          <>
            <RangeNote range={res.data.range} />
            <Section flush>
              {res.data.rows.length === 0 ? (
                <p className="p-10 text-center text-sm text-muted-foreground">{q ? "No creators match your search." : "No creators are available to you yet."}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[240px]">Creator</TableHead>
                        <TableHead className="text-right">Mapped ads</TableHead>
                        {cols.map((k) => <TableHead key={k} className="text-right whitespace-nowrap">{METRIC_BY_KEY[k].label}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {res.data.rows.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <Link href={hrefWith(`/creators/${c.id}`, filterParams(sp), {})} className="flex items-center gap-3">
                              <Avatar name={c.name} url={c.profileImageUrl} />
                              <div className="min-w-0">
                                <p className="truncate font-medium hover:underline">{c.name}</p>
                                <p className="truncate text-xs text-muted-foreground">{c.code}{c.instagramHandle ? ` · @${c.instagramHandle}` : ""}{!c.isActive ? " · inactive" : ""}</p>
                              </div>
                            </Link>
                          </TableCell>
                          <TableCell className="text-right tabular">{c.mappedAds}</TableCell>
                          {cols.map((k) => <TableCell key={k} className="text-right"><MetricValue k={k} v={c.metrics[k]} currency={res.data.range.currency} /></TableCell>)}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Section>
            <Pagination page={res.data.page} pageSize={res.data.pageSize} total={res.data.total} path="/creators" sp={sp} />
          </>
        )}
      </PageBody>
    </>
  );
}
