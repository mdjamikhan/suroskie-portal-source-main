import { Suspense } from "react";
import type { Metadata } from "next";
import { pageAccess } from "@/lib/auth/session";
import { queryAuditLog } from "@/lib/audit-query";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/metrics/format";
import type { SP } from "@/lib/url";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { Pagination } from "@/components/reports/creatives-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Audit logs" };

const ACTIONS = ["auth", "user", "role", "mapping", "naming_rule", "creator", "asset", "meta", "adaccount", "sync", "export", "settings", "metric"];

export default function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: { searchParams: Promise<SP> }) {
  await pageAccess("audit.view");
  const sp = await searchParams;
  const action = typeof sp.action === "string" && ACTIONS.includes(sp.action) ? sp.action : undefined;
  const actor = typeof sp.actor === "string" ? sp.actor.slice(0, 120) : undefined;
  const page = Math.max(1, Math.min(10_000, Number(sp.page) || 1));
  const [data, settings] = await Promise.all([queryAuditLog({ action, actor, page }), getSettings()]);
  return (
    <>
      <PageHeader title="Audit logs" description="Append-only record of sign-ins, access changes, mapping changes, Meta connections, syncs, settings and exports.">
        <form className="flex flex-wrap items-end gap-2" action="/audit-logs">
          <select name="action" defaultValue={action ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Action type">
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a.replace("_", " ")}</option>)}
          </select>
          <Input name="actor" defaultValue={actor} placeholder="Actor email" className="h-9 w-56" aria-label="Actor email" />
          <Button type="submit" size="sm" variant="outline" className="h-9">Filter</Button>
        </form>
      </PageHeader>
      <PageBody>
        <Section flush>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>When ({settings.reportingTimezone})</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Summary</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No entries.</TableCell></TableRow>}
                {data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateTime(r.createdAt, settings.reportingTimezone)}</TableCell>
                    <TableCell className="text-sm">{r.actorEmail ?? "system"}</TableCell>
                    <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.action}</code></TableCell>
                    <TableCell className="max-w-xl text-sm">
                      {r.summary}
                      {r.metadata ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-muted-foreground">Details</summary>
                          <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(r.metadata, null, 2)}</pre>
                        </details>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.ipAddress ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-5 py-3"><Pagination page={data.page} pageSize={data.pageSize} total={data.total} path="/audit-logs" sp={sp} /></div>
        </Section>
      </PageBody>
    </>
  );
}
