// Job execution. A worker claims jobs one at a time until its time budget is spent; each job
// is resumable (async report ids are stored in job.state) so short serverless invocations work.
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { Prisma, type SyncJob } from "@/generated/prisma/client";
import { SYSTEM_ACTOR } from "@/lib/audit";
import { clientForConnection } from "@/lib/meta/connection";
import { MetaApiError } from "@/lib/meta/errors";
import { BREAKDOWN_INSIGHT_FIELDS, BREAKDOWN_PARAMS, FIELD_TO_METRICS, INSIGHT_FIELDS } from "@/lib/meta/fields";
import { reportResults, reportStatus, startReportWithFieldFallback } from "@/lib/meta/insights";
import type { RawInsightRow } from "@/lib/meta/parse";
import type { MetaClient } from "@/lib/meta/client";
import { applyNamingRules } from "@/lib/mapping/service";
import { addDays, diffDays, todayIn } from "@/lib/reporting/date-range";
import { ingestBreakdowns, ingestInsights, type BreakdownKey } from "./ingest";
import { syncStructure } from "./structure";
import {
  claimNextJob, completeJob, enqueueJob, extendLease, failJob, logJobEvent, recoverExpiredLeases, requeueJob, saveJobState,
} from "./queue";

export interface WorkerDeps {
  /** Injected in tests to point at a mock Graph API / avoid real sleeps. */
  clientFactory?: (connectionId: string) => Promise<MetaClient>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type JobOutcome = { kind: "done"; stats: Prisma.InputJsonValue } | { kind: "requeued"; reason: string };

interface ReportState {
  reportRunId?: string;
  droppedFields?: string[];
  startedAt?: string;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function markUnsupported(fields: string[]) {
  const keys = [...new Set(fields.flatMap((f) => FIELD_TO_METRICS[f] ?? []))];
  if (!keys.length) return;
  await prisma.metricDefinition.updateMany({
    where: { key: { in: keys } },
    data: { isSupported: false, unsupportedReason: `Meta rejected field(s): ${fields.join(", ")}` },
  });
}

async function runReportJob(job: SyncJob, account: { id: string; metaAccountId: string; currency: string }, client: MetaClient, deps: Required<WorkerDeps>, deadline: number, workerId: string): Promise<JobOutcome> {
  const from = iso(job.dateFrom)!;
  const to = iso(job.dateTo)!;
  const breakdownType = job.breakdownType as BreakdownKey | null;
  const state = (job.state ?? {}) as ReportState;

  if (!state.reportRunId) {
    const started = await startReportWithFieldFallback(client, {
      accountId: account.metaAccountId,
      since: from,
      until: to,
      fields: breakdownType ? BREAKDOWN_INSIGHT_FIELDS : INSIGHT_FIELDS,
      breakdowns: breakdownType ? BREAKDOWN_PARAMS[breakdownType] : undefined,
    });
    state.reportRunId = started.reportRunId;
    state.droppedFields = started.droppedFields;
    state.startedAt = new Date().toISOString();
    await saveJobState(job.id, state as Prisma.InputJsonValue);
    if (started.droppedFields.length) {
      await logJobEvent(job.id, "warn", `Meta rejected fields; continuing without them`, { fields: started.droppedFields });
      await markUnsupported(started.droppedFields);
    }
  }

  // Poll the async report for up to ~2 minutes in this invocation.
  const pollUntil = Math.min(deadline - 15_000, deps.now() + 120_000);
  let delay = 2_000;
  for (;;) {
    const st = await reportStatus(client, state.reportRunId!);
    if (st.status === "completed") break;
    if (st.status === "failed") {
      await saveJobState(job.id, {} as Prisma.InputJsonValue);
      const span = diffDays(from, to) + 1;
      if (span > 7) {
        // Large windows occasionally fail on Meta's side; split and retry the halves.
        const mid = addDays(from, Math.floor(span / 2) - 1);
        for (const [a, b] of [[from, mid], [addDays(mid, 1), to]]) {
          await enqueueJob({ adAccountId: job.adAccountId, type: job.type, trigger: job.trigger, dateFrom: a, dateTo: b, breakdownType: breakdownType ?? undefined, priority: job.priority });
        }
        return { kind: "done", stats: { split: true, reason: `Meta report ${st.raw}` } };
      }
      throw new MetaApiError({ httpStatus: 200, kind: "transient", message: `Meta async report ended with status "${st.raw}"` });
    }
    if (deps.now() + delay > pollUntil) {
      await requeueJob(job.id, { runAfter: new Date(deps.now() + 20_000), countAttempt: false, state: state as Prisma.InputJsonValue });
      return { kind: "requeued", reason: `report ${Math.round(st.percent)}% complete` };
    }
    await deps.sleep(delay);
    delay = Math.min(delay * 1.5, 10_000);
  }

  const totals = { received: 0, inserted: 0, updated: 0, unchanged: 0, stubsCreated: 0, upserted: 0, pages: 0 };
  for await (const page of reportResults<RawInsightRow & Record<string, string>>(client, state.reportRunId!)) {
    totals.pages++;
    if (breakdownType) {
      const r = await ingestBreakdowns(account, breakdownType, page);
      totals.received += r.received;
      totals.upserted += r.upserted;
    } else {
      const r = await ingestInsights(account, page);
      totals.received += r.received;
      totals.inserted += r.inserted;
      totals.updated += r.updated;
      totals.unchanged += r.unchanged;
      totals.stubsCreated += r.stubsCreated;
    }
    await extendLease(job.id, workerId);
  }
  return { kind: "done", stats: { ...totals, from, to, breakdownType, droppedFields: state.droppedFields ?? [], metaRequests: client.requestCount } };
}

/** Run one claimed job to completion, requeue or failure. Never throws. */
export async function runJob(job: SyncJob, workerId: string, deadline: number, depsIn: WorkerDeps = {}): Promise<"succeeded" | "requeued" | "failed"> {
  const deps: Required<WorkerDeps> = { clientFactory: depsIn.clientFactory ?? ((id) => clientForConnection(id)), sleep: depsIn.sleep ?? realSleep, now: depsIn.now ?? Date.now };
  const account = await prisma.adAccount.findUnique({ where: { id: job.adAccountId }, include: { connection: { select: { id: true, status: true } } } });
  try {
    if (!account) {
      await failJob(job.id, "account_missing", "Ad account no longer exists");
      return "failed";
    }
    if (account.isDemo) {
      await completeJob(job.id, { skipped: "Demo accounts contain synthetic data and are never synced with Meta" });
      return "succeeded";
    }
    if (!account.syncEnabled) {
      await failJob(job.id, "sync_disabled", "Sync is disabled for this ad account");
      return "failed";
    }
    if (!account.connection || account.connection.status !== "ACTIVE") {
      await failJob(job.id, "connection_unavailable", "The Meta connection for this account is missing or not active. Reconnect it in Integrations.");
      await prisma.adAccount.update({ where: { id: account.id }, data: { syncHealth: "FAILING", lastSyncError: "Meta connection is not active" } });
      return "failed";
    }

    const client = await deps.clientFactory(account.connection.id);
    await logJobEvent(job.id, "info", `Started ${job.type} (attempt ${job.attempts})`);

    let outcome: JobOutcome;
    if (job.type === "STRUCTURE") {
      const stats = await syncStructure(client, account, () => extendLease(job.id, workerId));
      if (stats.droppedFields.length) await logJobEvent(job.id, "warn", "Meta rejected structure fields", { fields: stats.droppedFields });
      const naming = await applyNamingRules({ adAccountId: account.id, actor: SYSTEM_ACTOR });
      await prisma.adAccount.update({ where: { id: account.id }, data: { lastStructureSyncAt: new Date() } });
      outcome = { kind: "done", stats: { ...stats, namingRulesMatched: naming.matched, namingRulesAmbiguous: naming.ambiguous, metaRequests: client.requestCount } };
    } else {
      outcome = await runReportJob(job, account, client, deps, deadline, workerId);
    }

    if (outcome.kind === "requeued") {
      await logJobEvent(job.id, "info", `Waiting for Meta: ${outcome.reason}`);
      return "requeued";
    }

    await completeJob(job.id, outcome.stats);
    const now = new Date();
    const data: Prisma.AdAccountUpdateInput = { syncHealth: "OK", lastSyncError: null };
    if (job.type === "INSIGHTS") {
      data.lastInsightsSyncAt = now;
      const today = todayIn(account.timezoneName);
      if (job.dateTo && iso(job.dateTo)! >= addDays(today, -2)) data.lastSuccessfulSyncAt = now;
      if (job.trigger === "ATTRIBUTION_REFRESH") data.lastAttributionRefreshAt = now;
    }
    await prisma.adAccount.update({ where: { id: account.id }, data });
    await logJobEvent(job.id, "info", "Completed", outcome.stats);
    return "succeeded";
  } catch (e) {
    return handleFailure(job, account?.id ?? null, account?.connection?.id ?? null, e, deps);
  }
}

async function handleFailure(job: SyncJob, accountId: string | null, connectionId: string | null, e: unknown, deps: Required<WorkerDeps>): Promise<"requeued" | "failed"> {
  const meta = e instanceof MetaApiError ? e : null;
  const message = meta ? meta.describe() : e instanceof Error ? e.message : String(e);
  const code = meta ? `meta_${meta.kind}` : "internal_error";
  await logJobEvent(job.id, "error", message).catch(() => {});
  if (!meta) console.error(`[sync] job ${job.id} failed`, e);

  if (meta?.kind === "auth") {
    await failJob(job.id, code, message);
    if (connectionId) await prisma.metaConnection.update({ where: { id: connectionId }, data: { status: "EXPIRED", lastError: message.slice(0, 500) } });
    if (accountId) await prisma.adAccount.update({ where: { id: accountId }, data: { syncHealth: "FAILING", lastSyncError: "Meta access token expired or was revoked. Reconnect in Integrations." } });
    return "failed";
  }
  if (meta?.kind === "permission") {
    await failJob(job.id, code, message);
    if (accountId) await prisma.adAccount.update({ where: { id: accountId }, data: { syncHealth: "FAILING", lastSyncError: `Permission error: ${message}`.slice(0, 500) } });
    return "failed";
  }
  if (meta?.kind === "rate_limit") {
    const wait = Math.max(60_000, meta.retryAfterMs ?? 5 * 60_000);
    if (accountId) await prisma.adAccount.update({ where: { id: accountId }, data: { rateLimitedUntil: new Date(deps.now() + wait), syncHealth: "DEGRADED", lastSyncError: "Rate limited by Meta; retrying automatically" } });
    await requeueJob(job.id, { runAfter: new Date(deps.now() + wait), countAttempt: false, errorCode: code, errorMessage: message });
    return "requeued";
  }
  if (job.attempts < job.maxAttempts) {
    const backoff = Math.min(60, 2 ** job.attempts) * 60_000;
    await requeueJob(job.id, { runAfter: new Date(deps.now() + backoff), countAttempt: true, errorCode: code, errorMessage: message, state: meta?.kind === "invalid_request" ? ({} as Prisma.InputJsonValue) : undefined });
    if (accountId) await prisma.adAccount.update({ where: { id: accountId }, data: { syncHealth: "DEGRADED", lastSyncError: message.slice(0, 500) } });
    return "requeued";
  }
  await failJob(job.id, code, message);
  if (accountId) await prisma.adAccount.update({ where: { id: accountId }, data: { syncHealth: "FAILING", lastSyncError: message.slice(0, 500) } });
  return "failed";
}

export interface WorkerSummary {
  workerId: string;
  processed: number;
  succeeded: number;
  requeued: number;
  failed: number;
  recovered: number;
  stoppedBecause: "no_jobs" | "budget";
}

export async function runWorker(opts: { budgetMs: number; accountIds?: string[]; maxJobs?: number } & WorkerDeps): Promise<WorkerSummary> {
  const now = opts.now ?? Date.now;
  const workerId = `w-${randomUUID().slice(0, 8)}`;
  const deadline = now() + opts.budgetMs;
  const summary: WorkerSummary = { workerId, processed: 0, succeeded: 0, requeued: 0, failed: 0, recovered: await recoverExpiredLeases(), stoppedBecause: "no_jobs" };
  while (now() < deadline - 20_000 && summary.processed < (opts.maxJobs ?? Infinity)) {
    const job = await claimNextJob(workerId, opts.accountIds);
    if (!job) break;
    const r = await runJob(job, workerId, deadline, opts);
    summary.processed++;
    summary[r]++;
  }
  if (now() >= deadline - 20_000) summary.stoppedBecause = "budget";
  return summary;
}
