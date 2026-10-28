import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { pageAccess } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { demoMode } from "@/lib/reporting/service";
import { getSettings } from "@/lib/settings";
import { formatDateTime, relativeTime } from "@/lib/metrics/format";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { SyncNowButton, SyncToggle } from "@/components/admin/account-actions";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ad accounts" };

export default function AdAccountsPage() {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <AdAccounts />
    </Suspense>
  );
}

const HEALTH: Record<string, string> = { OK: "bg-emerald-100 text-emerald-800", DEGRADED: "bg-amber-100 text-amber-800", FAILING: "bg-red-100 text-red-800", NEVER_SYNCED: "bg-slate-100 text-slate-700" };
const JOB: Record<string, string> = { SUCCEEDED: "text-emerald-700", FAILED: "text-red-700", RUNNING: "text-blue-700", QUEUED: "text-slate-600", CANCELLED: "text-slate-400" };

async function AdAccounts() {
  const ctx = await pageAccess("adaccounts.view");
  const demo = demoMode();
  const scope = ctx.adAccounts === "ALL" ? {} : { id: { in: ctx.adAccounts } };
  const settings = await getSettings();
  const [accounts, jobs, counts] = await Promise.all([
    prisma.adAccount.findMany({ where: { isDemo: demo, ...scope }, include: { connection: { select: { label: true, status: true } } }, orderBy: [{ syncEnabled: "desc" }, { name: "asc" }] }),
    prisma.syncJob.findMany({
      where: { adAccount: { isDemo: demo, ...scope } },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { adAccount: { select: { name: true } } },
    }),
    prisma.syncJob.groupBy({ by: ["adAccountId", "status"], where: { status: { in: ["QUEUED", "RUNNING"] }, adAccount: { isDemo: demo, ...scope } }, _count: true }),
  ]);
  const pending = (id: string) => counts.filter((c) => c.adAccountId === id).reduce((s, c) => s + c._count, 0);
  const canIntegrate = ctx.permissions.has("integrations.manage");
  const canSync = ctx.permissions.has("sync.trigger");

  return (
    <>
      <PageHeader
        title="Ad accounts"
        description={`Synchronisation status. Recent ${settings.recentRefreshDays} days refresh on each scheduler run; the last ${settings.attributionRefreshDays} days are re-fetched daily for late attribution.`}
        actions={canIntegrate ? <Link href="/integrations" className="text-sm font-medium text-primary hover:underline">Manage Meta connections →</Link> : null}
      />
      <PageBody>
        {demo && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Demo mode: these accounts hold synthetic data and are never synced with Meta.</p>}
        <Section flush>
          {accounts.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              No ad accounts yet. {canIntegrate ? <Link className="text-primary underline" href="/integrations">Connect Meta</Link> : "Ask a Super Admin to connect Meta."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[240px]">Ad account</TableHead>
                    <TableHead>Sync</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Last successful sync</TableHead>
                    <TableHead>Structure / attribution refresh</TableHead>
                    <TableHead>History from</TableHead>
                    <TableHead>Queue</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <p className="font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.metaAccountId} · {a.currency} · {a.timezoneName}{a.connection ? ` · via ${a.connection.label}` : " · no connection"}</p>
                        {a.lastSyncError && <p className="mt-1 max-w-md text-xs text-red-700">{a.lastSyncError}</p>}
                      </TableCell>
                      <TableCell>{canIntegrate ? <SyncToggle id={a.id} enabled={a.syncEnabled} disabled={a.isDemo} /> : a.syncEnabled ? "On" : "Off"}</TableCell>
                      <TableCell><span className={cn("rounded px-2 py-0.5 text-xs font-medium", HEALTH[a.syncHealth])}>{a.syncHealth.replace("_", " ").toLowerCase()}</span></TableCell>
                      <TableCell className="text-sm whitespace-nowrap" title={formatDateTime(a.lastSuccessfulSyncAt, settings.reportingTimezone)}>{relativeTime(a.lastSuccessfulSyncAt)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{relativeTime(a.lastStructureSyncAt)} / {relativeTime(a.lastAttributionRefreshAt)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{a.historyStartDate?.toISOString().slice(0, 10) ?? "—"}</TableCell>
                      <TableCell className="text-xs">{pending(a.id) ? `${pending(a.id)} job(s)` : "idle"}{a.rateLimitedUntil && a.rateLimitedUntil > new Date() ? <Badge variant="secondary" className="ml-1">rate limited</Badge> : null}</TableCell>
                      <TableCell>{canSync && <SyncNowButton id={a.id} disabled={!a.syncEnabled || a.isDemo} />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>

        <Section title="Recent sync jobs" description="Failures retry automatically with backoff; authentication and permission errors need an admin." flush>
          {jobs.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No sync jobs have run yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Finished</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((j) => {
                    const stats = (j.stats ?? {}) as Record<string, unknown>;
                    return (
                      <TableRow key={j.id}>
                        <TableCell className="text-sm">{j.adAccount.name}</TableCell>
                        <TableCell className="text-xs">{j.type.toLowerCase()}{j.breakdownType ? ` · ${j.breakdownType.toLowerCase()}` : ""}<br /><span className="text-muted-foreground">{j.trigger.toLowerCase().replace(/_/g, " ")}</span></TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{j.dateFrom ? `${j.dateFrom.toISOString().slice(0, 10)} → ${j.dateTo?.toISOString().slice(0, 10)}` : "—"}</TableCell>
                        <TableCell className={cn("text-xs font-medium", JOB[j.status])}>{j.status.toLowerCase()}</TableCell>
                        <TableCell className="text-xs">{j.attempts}/{j.maxAttempts}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{j.finishedAt ? formatDateTime(j.finishedAt, settings.reportingTimezone) : j.status === "QUEUED" ? `after ${formatDateTime(j.runAfter, settings.reportingTimezone)}` : "—"}</TableCell>
                        <TableCell className="max-w-md text-xs">
                          {j.errorMessage ? <span className="text-red-700">{j.errorMessage}</span> : j.status === "SUCCEEDED" ? (
                            <span className="text-muted-foreground">
                              {"received" in stats ? `${stats.received} rows · ${stats.inserted ?? 0} new · ${stats.updated ?? 0} revised` : "ads" in stats ? `${stats.campaigns} campaigns · ${stats.ads} ads (${stats.newAds} new)` : "skipped" in stats ? String(stats.skipped) : "split" in stats ? "split into smaller ranges" : ""}
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>
      </PageBody>
    </>
  );
}
