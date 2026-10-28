import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { pageAccess } from "@/lib/auth/session";
import { listAdsForMapping } from "@/lib/mapping/queries";
import { getFilterOptions } from "@/lib/reporting/options";
import { prisma } from "@/lib/db";
import { hrefWith, type SP } from "@/lib/url";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { CreativesTabs } from "@/components/reports/creatives-tabs";
import { Pagination } from "@/components/reports/creatives-table";
import { MappingWorkspace, type MappingRow } from "@/components/admin/mapping-workspace";
import { NamingRules } from "@/components/admin/naming-rules";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Creator mapping" };

export default function MappingPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <Mapping searchParams={searchParams} />
    </Suspense>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Mapping({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await pageAccess("mapping.manage");
  const sp = await searchParams;
  const status = (["all", "unmapped", "mapped"].includes(str(sp.status) ?? "") ? str(sp.status) : "unmapped") as "all" | "unmapped" | "mapped";
  const page = Math.max(1, Math.min(10_000, Number(str(sp.page)) || 1));
  const q = str(sp.q)?.slice(0, 120);
  const account = str(sp.account);
  const [data, options, rules] = await Promise.all([
    listAdsForMapping(ctx, { status, account, q, page, pageSize: 50 }),
    getFilterOptions(ctx),
    prisma.namingRule.findMany({ orderBy: { priority: "asc" } }),
  ]);
  const canApply = ctx.adAccounts === "ALL" && ctx.creators === "ALL";

  return (
    <>
      <PageHeader title="Creatives" description="Assign each Meta ad to exactly one creator. Changes are recorded in the mapping history and audit log." />
      <CreativesTabs active="mapping" canReport={ctx.permissions.has("reports.creatives")} canMap />
      <PageBody>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap rounded-lg border bg-card p-0.5">
            {(["unmapped", "mapped", "all"] as const).map((s) => (
              <Link key={s} href={hrefWith("/creatives/mapping", sp, { status: s, page: null })} className={cn("rounded-md px-3 py-1.5 text-sm capitalize", status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {s === "unmapped" ? `Needs review (${data.unmappedTotal})` : s}
              </Link>
            ))}
          </div>
          <form action="/creatives/mapping" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="status" value={status} />
            <select name="account" defaultValue={account ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm sm:w-auto" aria-label="Ad account">
              <option value="">All ad accounts</option>
              {options.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <Input name="q" defaultValue={q} placeholder="Ad name, ad ID or campaign" className="h-9 w-full sm:w-64" aria-label="Search ads" />
            <Button type="submit" variant="outline" size="sm" className="h-9">Filter</Button>
          </form>
        </div>
        <MappingWorkspace rows={data.rows as unknown as MappingRow[]} />
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} path="/creatives/mapping" sp={sp} />
        {canApply && <Section title="Naming-convention rules" description="Optional automatic mapping. Manual corrections always win.">
          <NamingRules rules={rules} canApply={canApply} />
        </Section>}
      </PageBody>
    </>
  );
}
