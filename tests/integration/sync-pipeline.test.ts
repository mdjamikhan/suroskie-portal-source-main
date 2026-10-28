import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMockMeta } from "../mock-meta/server";
import { ctxFor, makeUser, resetDb } from "../helpers/db";
import { prisma } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { clientForConnection, createConnection, discoverAdAccounts } from "@/lib/meta/connection";
import { scheduleSync, requestManualSync } from "@/lib/sync/scheduler";
import { runWorker } from "@/lib/sync/worker";
import { claimNextJob, enqueueJob, recoverExpiredLeases } from "@/lib/sync/queue";
import { updateSettings } from "@/lib/settings";
import { getOverview } from "@/lib/reporting/service";
import { decryptSecret } from "@/lib/crypto";
import { ValidationError } from "@/lib/errors";

const TOKEN = "EAAB-valid-system-user-token-for-tests";
let mock: Awaited<ReturnType<typeof startMockMeta>>;
let accountId: string;
let connectionId: string;
const noSleep = async () => {};
const deps = { clientFactory: (id: string) => clientForConnection(id, { sleep: noSleep }), sleep: noSleep };

async function control(body: Record<string, string>) {
  await fetch(`${mock.url}/__control`, { method: "POST", body: new URLSearchParams(body) });
}

beforeAll(async () => {
  mock = await startMockMeta();
  process.env.META_GRAPH_BASE_URL = mock.url;
  resetEnvCache();
  await resetDb();
  await updateSettings({ backfillMonths: 1, attributionRefreshDays: 7, recentRefreshDays: 2, breakdownDays: 7 }, null);
});

afterAll(async () => {
  await mock.close();
  delete process.env.META_GRAPH_BASE_URL;
  resetEnvCache();
});

beforeEach(() => control({ mode: "", purchaseMultiplier: "1" }));

describe("Meta connection", () => {
  it("rejects invalid tokens", async () => {
    await expect(createConnection({ label: "x", accessToken: "EAAB-wrong-token-000000", authType: "SYSTEM_USER_TOKEN", createdById: "u" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("validates, encrypts and discovers ad accounts (sync off until enabled)", async () => {
    const admin = await makeUser({ email: "admin@sync", role: "super_admin" });
    const conn = await createConnection({ label: "System user", accessToken: TOKEN, authType: "SYSTEM_USER_TOKEN", createdById: admin });
    connectionId = conn.id;
    expect(conn.scopes).toContain("ads_read");
    const row = await prisma.metaConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.encryptedToken).not.toContain(TOKEN);
    expect(decryptSecret(row.encryptedToken)).toBe(TOKEN);
    expect(row.tokenExpiresAt).toBeNull(); // system user token: no expiry

    const accounts = await discoverAdAccounts(conn.id);
    expect(accounts).toHaveLength(1);
    const acc = await prisma.adAccount.findUniqueOrThrow({ where: { metaAccountId: "act_111" } });
    expect(acc).toMatchObject({ currency: "INR", timezoneName: "Asia/Kolkata", syncEnabled: false, isDemo: false });
    accountId = acc.id;
    // Nothing scheduled while disabled.
    expect((await scheduleSync()).accounts).toBe(0);
  });
});

describe("scheduled sync", () => {
  it("imports structure, creatives and daily insights end-to-end", async () => {
    await prisma.adAccount.update({ where: { id: accountId }, data: { syncEnabled: true } });
    const sched = await scheduleSync();
    expect(sched.accounts).toBe(1);
    expect(sched.enqueued).toBeGreaterThan(3); // structure + recent + attribution + breakdowns + backfill chunks
    const w = await runWorker({ budgetMs: 600_000, ...deps });
    expect(w.failed).toBe(0);
    expect(await prisma.syncJob.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } })).toBe(0);

    expect(await prisma.campaign.count()).toBe(1);
    expect(await prisma.adSet.count()).toBe(2);
    expect(await prisma.ad.count()).toBe(3); // two pages of ads
    const creatives = await prisma.adCreative.findMany({ orderBy: { metaCreativeId: "asc" } });
    expect(creatives.map((c) => c.creativeType)).toEqual(["VIDEO", "IMAGE", "VIDEO"]);
    expect(creatives[0].thumbnailUrl).toContain("fbcdn");
    expect(await prisma.ad.count({ where: { creativeId: null } })).toBe(0);

    const acc = await prisma.adAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(acc.syncHealth).toBe("OK");
    expect(acc.lastSuccessfulSyncAt).not.toBeNull();
    expect(acc.lastAttributionRefreshAt).not.toBeNull();
    expect(acc.backfillQueuedAt).not.toBeNull();

    // Overlapping purchase action types were not double counted.
    const row = await prisma.adInsightDaily.findFirstOrThrow({ where: { ad: { metaAdId: "900001" } } });
    expect(Number(row.purchases)).toBe(2);
    expect(Number(row.purchaseValue)).toBe(1000);
    expect(Number(row.results)).toBe(2);
    expect(row.resultType).toBe("purchase");
    expect(row.thruplays).toBeNull(); // image ad
    expect(await prisma.adInsightBreakdownDaily.count()).toBeGreaterThan(0);
  });

  it("sent every Graph API call with Bearer auth + appsecret_proof and never put the token in a URL", () => {
    const userCalls = mock.state.requests.filter((r) => r.path !== "debug_token" && r.path !== "oauth/access_token");
    expect(userCalls.length).toBeGreaterThan(10);
    expect(userCalls.every((r) => r.hadBearer && r.proofOk && !r.tokenInUrl)).toBe(true);
  });

  it("re-syncing the same window is idempotent", async () => {
    const before = await prisma.adInsightDaily.count();
    const admin = (await prisma.user.findFirstOrThrow()).id;
    await requestManualSync(accountId, admin, { from: "2026-10-20", to: "2026-10-22" });
    const w = await runWorker({ budgetMs: 600_000, ...deps });
    expect(w.failed).toBe(0);
    expect(await prisma.adInsightDaily.count()).toBe(before);
    const dupes = await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM (SELECT "adId", date FROM ad_insight_daily GROUP BY 1, 2 HAVING COUNT(*) > 1) d`;
    expect(dupes[0].n).toBe(0);
  });

  it("attribution updates revise rows and keep the previous values", async () => {
    await control({ purchaseMultiplier: "2" });
    const admin = (await prisma.user.findFirstOrThrow()).id;
    await requestManualSync(accountId, admin, { from: "2026-10-20", to: "2026-10-20" });
    await runWorker({ budgetMs: 600_000, ...deps });
    const row = await prisma.adInsightDaily.findFirstOrThrow({ where: { ad: { metaAdId: "900001" }, date: new Date("2026-10-20T00:00:00Z") }, include: { revisions: true } });
    expect(Number(row.purchases)).toBe(4);
    expect(row.revision).toBe(2);
    expect(row.revisions).toHaveLength(1);
    expect((row.revisions[0].previousValues as { purchases: number }).purchases).toBe(2);
  });

  it("reports reflect synchronised data", async () => {
    const admin = (await prisma.user.findFirstOrThrow()).id;
    const o = await getOverview(await ctxFor(admin), { range: "custom", from: "2026-10-21", to: "2026-10-21" });
    // Day 21: ads n=1..3, spend = 100n + 21 → 121 + 221 + 321
    expect(o.metrics.spend).toEqual({ s: "ok", v: 663 });
  });
});

describe("failure handling", () => {
  it("expired tokens fail the job, flag the connection and stop retries", async () => {
    await control({ mode: "auth_error" });
    await enqueueJob({ adAccountId: accountId, type: "STRUCTURE", trigger: "MANUAL" });
    const w = await runWorker({ budgetMs: 60_000, ...deps });
    expect(w.failed).toBe(1);
    expect((await prisma.metaConnection.findUniqueOrThrow({ where: { id: connectionId } })).status).toBe("EXPIRED");
    expect((await prisma.adAccount.findUniqueOrThrow({ where: { id: accountId } })).syncHealth).toBe("FAILING");
    // Scheduler skips accounts whose connection isn't active.
    expect((await scheduleSync()).accounts).toBe(0);
    await prisma.metaConnection.update({ where: { id: connectionId }, data: { status: "ACTIVE" } });
  });

  it("rate limits pause the account and requeue without consuming an attempt", async () => {
    await control({ mode: "rate_limit" });
    const job = await enqueueJob({ adAccountId: accountId, type: "STRUCTURE", trigger: "MANUAL" });
    const w = await runWorker({ budgetMs: 60_000, ...deps });
    expect(w.requeued).toBe(1);
    const j = await prisma.syncJob.findUniqueOrThrow({ where: { id: job!.id } });
    expect(j).toMatchObject({ status: "QUEUED", attempts: 0, errorCode: "meta_rate_limit" });
    const acc = await prisma.adAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(acc.rateLimitedUntil!.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
    // Paused account is not claimed.
    expect(await claimNextJob("w-test")).toBeNull();
    await prisma.adAccount.update({ where: { id: accountId }, data: { rateLimitedUntil: null } });
    await prisma.syncJob.update({ where: { id: job!.id }, data: { status: "CANCELLED" } });
  });

  it("transient errors are retried transparently", async () => {
    await control({ mode: "transient_once" });
    await enqueueJob({ adAccountId: accountId, type: "STRUCTURE", trigger: "MANUAL" });
    const w = await runWorker({ budgetMs: 60_000, ...deps });
    expect(w.succeeded).toBe(1);
  });

  it("drops fields Meta rejects and marks dependent metrics unsupported", async () => {
    await control({ mode: "reject_field:video_p95_watched_actions" });
    await enqueueJob({ adAccountId: accountId, type: "INSIGHTS", trigger: "MANUAL", dateFrom: "2026-10-23", dateTo: "2026-10-23" });
    const w = await runWorker({ budgetMs: 60_000, ...deps });
    expect(w.succeeded).toBe(1);
    expect((await prisma.metricDefinition.findUniqueOrThrow({ where: { key: "video_p95" } })).isSupported).toBe(false);
    const admin = (await prisma.user.findFirstOrThrow()).id;
    const o = await getOverview(await ctxFor(admin), { range: "custom", from: "2026-10-23", to: "2026-10-23" });
    expect(o.metrics.video_p95.s).toBe("unavailable");
    await prisma.metricDefinition.update({ where: { key: "video_p95" }, data: { isSupported: true } });
  });

  it("splits large windows when Meta fails an async report", async () => {
    await control({ mode: "report_failed" });
    const job = await enqueueJob({ adAccountId: accountId, type: "INSIGHTS", trigger: "MANUAL", dateFrom: "2026-09-01", dateTo: "2026-09-20" });
    await runWorker({ budgetMs: 60_000, maxJobs: 1, ...deps });
    expect((await prisma.syncJob.findUniqueOrThrow({ where: { id: job!.id } })).status).toBe("SUCCEEDED");
    const children = await prisma.syncJob.findMany({ where: { status: "QUEUED", dateFrom: { gte: new Date("2026-09-01") }, dateTo: { lte: new Date("2026-09-20") } } });
    expect(children).toHaveLength(2);
    await prisma.syncJob.updateMany({ where: { id: { in: children.map((c) => c.id) } }, data: { status: "CANCELLED" } });
  });

  it("deduplicates queued work and recovers crashed workers", async () => {
    const a = await enqueueJob({ adAccountId: accountId, type: "INSIGHTS", trigger: "MANUAL", dateFrom: "2026-10-01", dateTo: "2026-10-02" });
    const b = await enqueueJob({ adAccountId: accountId, type: "INSIGHTS", trigger: "SCHEDULED", dateFrom: "2026-10-01", dateTo: "2026-10-02" });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    const claimed = await claimNextJob("w-crash");
    expect(claimed?.id).toBe(a!.id);
    expect(await claimNextJob("w-other")).toBeNull(); // one running job per account
    await prisma.syncJob.update({ where: { id: a!.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    expect(await recoverExpiredLeases()).toBe(1);
    expect((await prisma.syncJob.findUniqueOrThrow({ where: { id: a!.id } })).status).toBe("QUEUED");
  });
});
