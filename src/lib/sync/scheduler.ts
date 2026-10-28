// Decides what to sync. Called by the cron endpoint (or the standalone worker) — typically hourly.
//  * hourly:   structure discovery + the last `recentRefreshDays` of insights
//  * daily:    re-fetch the last `attributionRefreshDays` (late attribution) + breakdowns
//  * once:     historical backfill in 30-day chunks back to `backfillMonths` (≤ 37, Meta's retention)
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, todayIn } from "@/lib/reporting/date-range";
import { BREAKDOWN_PARAMS } from "@/lib/meta/fields";
import { enqueueJob, recoverExpiredLeases, type BreakdownTypeKey, type JobTrigger } from "./queue";

const HOUR = 3_600_000;
export const BACKFILL_CHUNK_DAYS = 30;

function monthsBack(today: string, months: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function chunkRange(from: string, to: string, days: number): [string, string][] {
  const out: [string, string][] = [];
  // Newest first so recent history becomes available soonest.
  let end = to;
  while (end >= from) {
    const start = addDays(end, -(days - 1)) < from ? from : addDays(end, -(days - 1));
    out.push([start, end]);
    end = addDays(start, -1);
  }
  return out;
}

export interface ScheduleSummary {
  accounts: number;
  enqueued: number;
  recovered: number;
}

export async function scheduleSync(now: Date = new Date()): Promise<ScheduleSummary> {
  const settings = await getSettings();
  const recovered = await recoverExpiredLeases();
  const accounts = await prisma.adAccount.findMany({
    where: { syncEnabled: true, isDemo: false, connection: { status: "ACTIVE" } },
  });
  let enqueued = 0;
  const add = async (...args: Parameters<typeof enqueueJob>) => {
    if (await enqueueJob(...args)) enqueued++;
  };
  const breakdownTypes = Object.keys(BREAKDOWN_PARAMS) as BreakdownTypeKey[];

  for (const acc of accounts) {
    const today = todayIn(acc.timezoneName, now);
    const t = now.getTime();

    if (!acc.lastStructureSyncAt || t - acc.lastStructureSyncAt.getTime() > 55 * 60_000) {
      await add({ adAccountId: acc.id, type: "STRUCTURE", trigger: "SCHEDULED", priority: 50 });
    }

    const recentFrom = addDays(today, -settings.recentRefreshDays);
    await add({ adAccountId: acc.id, type: "INSIGHTS", trigger: "SCHEDULED", dateFrom: recentFrom, dateTo: today, priority: 60 });

    if (!acc.lastAttributionRefreshAt || t - acc.lastAttributionRefreshAt.getTime() > 23 * HOUR) {
      const from = addDays(today, -settings.attributionRefreshDays);
      const to = addDays(recentFrom, -1);
      if (from <= to) await add({ adAccountId: acc.id, type: "INSIGHTS", trigger: "ATTRIBUTION_REFRESH", dateFrom: from, dateTo: to, priority: 120 });
      if (settings.breakdownDays > 0) {
        const bFrom = addDays(today, -Math.min(settings.breakdownDays, settings.attributionRefreshDays));
        for (const bt of breakdownTypes) {
          await add({ adAccountId: acc.id, type: "BREAKDOWNS", trigger: "ATTRIBUTION_REFRESH", breakdownType: bt, dateFrom: bFrom, dateTo: today, priority: 150 });
        }
      }
    }

    if (!acc.backfillQueuedAt) {
      enqueued += await enqueueBackfill(acc.id, today, settings, "INITIAL_BACKFILL");
    }
  }
  return { accounts: accounts.length, enqueued, recovered };
}

export async function enqueueBackfill(
  adAccountId: string,
  today: string,
  settings: { backfillMonths: number; attributionRefreshDays: number; breakdownDays: number },
  trigger: JobTrigger,
  requestedById?: string,
): Promise<number> {
  let n = 0;
  const historyStart = monthsBack(today, settings.backfillMonths);
  const backfillEnd = addDays(today, -settings.attributionRefreshDays - 1);
  const chunks = chunkRange(historyStart, backfillEnd, BACKFILL_CHUNK_DAYS);
  for (const [i, [from, to]] of chunks.entries()) {
    if (await enqueueJob({ adAccountId, type: "INSIGHTS", trigger, dateFrom: from, dateTo: to, priority: 200 + i, requestedById })) n++;
  }
  if (settings.breakdownDays > settings.attributionRefreshDays) {
    const bChunks = chunkRange(addDays(today, -settings.breakdownDays), backfillEnd, BACKFILL_CHUNK_DAYS);
    for (const [i, [from, to]] of bChunks.entries()) {
      for (const bt of Object.keys(BREAKDOWN_PARAMS) as BreakdownTypeKey[]) {
        if (await enqueueJob({ adAccountId, type: "BREAKDOWNS", trigger, breakdownType: bt, dateFrom: from, dateTo: to, priority: 400 + i, requestedById })) n++;
      }
    }
  }
  await prisma.adAccount.update({ where: { id: adAccountId }, data: { backfillQueuedAt: new Date(), historyStartDate: new Date(`${historyStart}T00:00:00Z`) } });
  return n;
}

/** Manual "sync now": structure + recent attribution window at high priority. */
export async function requestManualSync(adAccountId: string, requestedById: string, range?: { from: string; to: string }) {
  const settings = await getSettings();
  const acc = await prisma.adAccount.findUniqueOrThrow({ where: { id: adAccountId } });
  const today = todayIn(acc.timezoneName);
  const jobs = [];
  jobs.push(await enqueueJob({ adAccountId, type: "STRUCTURE", trigger: "MANUAL", priority: 10, requestedById }));
  const from = range?.from ?? addDays(today, -settings.attributionRefreshDays);
  const to = range?.to ?? today;
  for (const [i, [a, b]] of chunkRange(from, to, BACKFILL_CHUNK_DAYS).entries()) {
    jobs.push(await enqueueJob({ adAccountId, type: "INSIGHTS", trigger: "MANUAL", dateFrom: a, dateTo: b, priority: 20 + i, requestedById }));
  }
  return { enqueued: jobs.filter(Boolean).length, alreadyQueued: jobs.filter((j) => !j).length };
}

/** Data-retention housekeeping. Daily insights are kept indefinitely (business history). */
export async function runRetention(settings?: { breakdownDays: number }) {
  const s = settings ?? (await getSettings());
  const days = (n: number) => new Date(Date.now() - n * 86_400_000);
  const [jobs, events, revisions, breakdowns, rateLimits, verifications] = await Promise.all([
    prisma.syncJob.deleteMany({ where: { status: { in: ["SUCCEEDED", "CANCELLED", "FAILED"] }, finishedAt: { lt: days(90) } } }),
    prisma.syncJobEvent.deleteMany({ where: { createdAt: { lt: days(30) } } }),
    prisma.adInsightRevision.deleteMany({ where: { changedAt: { lt: days(400) } } }),
    prisma.adInsightBreakdownDaily.deleteMany({ where: { date: { lt: days(s.breakdownDays + 60) } } }),
    prisma.rateLimit.deleteMany({ where: { lastRequest: { lt: BigInt(Date.now() - 86_400_000) } } }),
    prisma.verification.deleteMany({ where: { expiresAt: { lt: days(1) } } }),
  ]);
  return { jobs: jobs.count, events: events.count, revisions: revisions.count, breakdowns: breakdowns.count, rateLimits: rateLimits.count, verifications: verifications.count };
}
