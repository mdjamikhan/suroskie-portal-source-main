// Postgres-backed job queue.
//  * claim: FOR UPDATE SKIP LOCKED, one running job per ad account, honours rate-limit pauses
//  * leases: a crashed worker's job is recovered after its lease expires
//  * dedupe: a partial unique index on dedupeKey (QUEUED/RUNNING) prevents duplicate work
import { prisma } from "@/lib/db";
import { Prisma, type SyncJob } from "@/generated/prisma/client";

export type JobType = "STRUCTURE" | "INSIGHTS" | "BREAKDOWNS";
export type JobTrigger = "SCHEDULED" | "MANUAL" | "INITIAL_BACKFILL" | "ATTRIBUTION_REFRESH";
export type BreakdownTypeKey = "AGE_GENDER" | "PLATFORM_POSITION" | "DEVICE_PLATFORM" | "COUNTRY" | "REGION";

export const LEASE_MS = 10 * 60_000;

export interface EnqueueInput {
  adAccountId: string;
  type: JobType;
  trigger: JobTrigger;
  dateFrom?: string;
  dateTo?: string;
  breakdownType?: BreakdownTypeKey;
  priority?: number;
  requestedById?: string | null;
  runAfter?: Date;
  maxAttempts?: number;
}

export function dedupeKey(i: Pick<EnqueueInput, "adAccountId" | "type" | "dateFrom" | "dateTo" | "breakdownType">): string {
  return [i.type, i.adAccountId, i.breakdownType ?? "-", i.dateFrom ?? "-", i.dateTo ?? "-"].join(":");
}

const toDate = (s?: string) => (s ? new Date(`${s}T00:00:00Z`) : undefined);

/** Enqueue a job; returns null if an identical job is already queued or running. */
export async function enqueueJob(input: EnqueueInput): Promise<SyncJob | null> {
  try {
    return await prisma.syncJob.create({
      data: {
        adAccountId: input.adAccountId,
        type: input.type,
        trigger: input.trigger,
        dateFrom: toDate(input.dateFrom),
        dateTo: toDate(input.dateTo),
        breakdownType: input.breakdownType,
        priority: input.priority ?? 100,
        requestedById: input.requestedById ?? null,
        runAfter: input.runAfter ?? new Date(),
        maxAttempts: input.maxAttempts ?? 6,
        dedupeKey: dedupeKey(input),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

/** Atomically claim the next runnable job. */
export async function claimNextJob(workerId: string, onlyAccountIds?: string[]): Promise<SyncJob | null> {
  const accountFilter = onlyAccountIds ? Prisma.sql`AND j."adAccountId" = ANY(${onlyAccountIds}::text[])` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH next AS (
      SELECT j.id FROM sync_job j
      JOIN ad_account a ON a.id = j."adAccountId"
      WHERE j.status = 'QUEUED' AND j."runAfter" <= now()
        AND (a."rateLimitedUntil" IS NULL OR a."rateLimitedUntil" <= now())
        AND NOT EXISTS (SELECT 1 FROM sync_job r WHERE r."adAccountId" = j."adAccountId" AND r.status = 'RUNNING')
        ${accountFilter}
      ORDER BY j.priority ASC, j."runAfter" ASC, j."createdAt" ASC
      FOR UPDATE OF j SKIP LOCKED
      LIMIT 1
    )
    UPDATE sync_job SET status = 'RUNNING', "lockedBy" = ${workerId}, attempts = sync_job.attempts + 1,
      "leaseExpiresAt" = now() + (${LEASE_MS}::int * interval '1 millisecond'),
      "startedAt" = COALESCE(sync_job."startedAt", now()), "updatedAt" = now()
    FROM next WHERE sync_job.id = next.id
    RETURNING sync_job.id`);
  if (!rows[0]) return null;
  return prisma.syncJob.findUnique({ where: { id: rows[0].id } });
}

export async function extendLease(jobId: string, workerId: string) {
  await prisma.syncJob.updateMany({
    where: { id: jobId, lockedBy: workerId, status: "RUNNING" },
    data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
  });
}

export async function completeJob(jobId: string, stats: Prisma.InputJsonValue) {
  await prisma.syncJob.update({
    where: { id: jobId },
    data: { status: "SUCCEEDED", finishedAt: new Date(), stats, lockedBy: null, leaseExpiresAt: null, errorCode: null, errorMessage: null, state: Prisma.DbNull },
  });
}

/** Put a job back in the queue. `countAttempt=false` for rate limits / still-running reports. */
export async function requeueJob(jobId: string, opts: { runAfter: Date; countAttempt: boolean; state?: Prisma.InputJsonValue; errorCode?: string; errorMessage?: string }) {
  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: "QUEUED", runAfter: opts.runAfter, lockedBy: null, leaseExpiresAt: null,
      ...(opts.countAttempt ? {} : { attempts: { decrement: 1 } }),
      ...(opts.state !== undefined ? { state: opts.state } : {}),
      errorCode: opts.errorCode ?? null, errorMessage: opts.errorMessage?.slice(0, 1000) ?? null,
    },
  });
}

export async function failJob(jobId: string, errorCode: string, errorMessage: string) {
  await prisma.syncJob.update({
    where: { id: jobId },
    data: { status: "FAILED", finishedAt: new Date(), lockedBy: null, leaseExpiresAt: null, errorCode, errorMessage: errorMessage.slice(0, 1000) },
  });
}

export async function saveJobState(jobId: string, state: Prisma.InputJsonValue) {
  await prisma.syncJob.update({ where: { id: jobId }, data: { state } });
}

export async function logJobEvent(jobId: string, level: "info" | "warn" | "error", message: string, data?: Prisma.InputJsonValue) {
  await prisma.syncJobEvent.create({ data: { jobId, level, message: message.slice(0, 1000), data } });
}

/** Recover jobs whose worker died mid-run. */
export async function recoverExpiredLeases(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE sync_job SET
      status = CASE WHEN attempts >= "maxAttempts" THEN 'FAILED'::"SyncJobStatus" ELSE 'QUEUED'::"SyncJobStatus" END,
      "finishedAt" = CASE WHEN attempts >= "maxAttempts" THEN now() ELSE NULL END,
      "lockedBy" = NULL, "leaseExpiresAt" = NULL, "errorCode" = 'lease_expired',
      "errorMessage" = 'Worker stopped before finishing; job was recovered', "updatedAt" = now()
    WHERE status = 'RUNNING' AND "leaseExpiresAt" < now()`;
}

/** Cancel queued jobs (e.g. when an account is disabled or disconnected). */
export async function cancelQueuedJobs(adAccountId: string) {
  return prisma.syncJob.updateMany({ where: { adAccountId, status: "QUEUED" }, data: { status: "CANCELLED", finishedAt: new Date() } });
}
