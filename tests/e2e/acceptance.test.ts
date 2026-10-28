// End-to-end acceptance workflow over real HTTP against `next start`, the test database and the
// mock Graph API. Mirrors the 10 acceptance criteria in the project brief.
import { beforeAll, describe, expect, it } from "vitest";
import { makeUser, resetDb } from "../helpers/db";
import { BASE, Session } from "../helpers/http";
import { prisma } from "@/lib/db";

const ADMIN = { email: "owner@suroskie.test", password: "super-admin-passphrase-123" };
const TOKEN = "EAAB-valid-system-user-token-for-tests";
const CRON = process.env.CRON_SECRET!;

const admin = new Session();
const member = new Session();
let accountId = "";
let creatorA = "";
let creatorB = "";
let memberEmail = "";

beforeAll(async () => {
  await resetDb();
  await makeUser({ email: ADMIN.email, role: "super_admin", password: ADMIN.password });
});

describe("acceptance workflow", () => {
  it("1. the super admin signs in", async () => {
    const bad = await new Session().signIn(ADMIN.email, "wrong-password-123");
    expect(bad.status).toBe(401);
    const r = await admin.signIn(ADMIN.email, ADMIN.password);
    expect(r.status).toBe(200);
    expect([...admin.cookies.keys()].some((k) => k.includes("session_token"))).toBe(true);
    const page = await admin.req("/overview");
    expect(page.status).toBe(200);
  });

  it("2. connects an authorised Meta ad account (token validated, encrypted, never returned)", async () => {
    // Small windows keep the test fast.
    expect((await admin.json("/api/v1/admin/settings", { method: "PATCH", body: { backfillMonths: 1, attributionRefreshDays: 7, recentRefreshDays: 2, breakdownDays: 7, minSpendForRanking: 0, minPurchasesForRanking: 0 } })).status).toBe(200);
    const bad = await admin.json("/api/v1/admin/meta/connections", { method: "POST", body: { label: "Wrong", accessToken: "EAAB-not-a-valid-token-xyz" } });
    expect(bad.status).toBe(400);
    const r = await admin.json("/api/v1/admin/meta/connections", { method: "POST", body: { label: "Suroskie system user", accessToken: TOKEN } });
    expect(r.status).toBe(200);
    expect(r.body.discoveredAccounts).toBe(1);
    const list = await admin.req("/api/v1/admin/meta/connections");
    const text = await list.text();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("encryptedToken");
    accountId = (await prisma.adAccount.findUniqueOrThrow({ where: { metaAccountId: "act_111" } })).id;
    expect((await admin.json(`/api/v1/admin/ad-accounts/${accountId}`, { method: "PATCH", body: { syncEnabled: true } })).status).toBe(200);
  });

  it("3. imports campaigns, ad sets, ads and performance automatically (cron)", async () => {
    expect((await new Session().json("/api/cron/sync")).status).toBe(401);
    const r = await new Session().json("/api/cron/sync", { headers: { Authorization: `Bearer ${CRON}` } });
    expect(r.status).toBe(200);
    expect(r.body.schedule.accounts).toBe(1);
    expect(r.body.retention).not.toBeNull();
    expect(r.body.worker.failed).toBe(0);
    // Drain anything left (backfill chunks).
    for (let i = 0; i < 5 && (await prisma.syncJob.count({ where: { status: "QUEUED" } })); i++) {
      await new Session().json("/api/cron/worker", { headers: { Authorization: `Bearer ${CRON}` } });
    }
    expect(await prisma.ad.count()).toBe(3);
    expect(await prisma.adInsightDaily.count()).toBeGreaterThan(30);
    const jobs = await admin.json("/api/v1/admin/sync/jobs");
    expect(jobs.body.every((j: { status: string }) => j.status === "SUCCEEDED")).toBe(true);
  });

  it("4. the admin maps ads to creators", async () => {
    creatorA = (await admin.json("/api/v1/admin/creators", { method: "POST", body: { code: "CR001", name: "Aanya", instagramHandle: "aanya" } })).body.id;
    creatorB = (await admin.json("/api/v1/admin/creators", { method: "POST", body: { code: "CR002", name: "Bilal" } })).body.id;
    const unmapped = await admin.json("/api/v1/admin/ads?status=unmapped");
    expect(unmapped.body.unmappedTotal).toBe(3);
    const ads = await prisma.ad.findMany({ orderBy: { metaAdId: "asc" } });
    expect((await admin.json("/api/v1/admin/mappings", { method: "POST", body: { adIds: [ads[0].id], creatorId: creatorA, reason: "brief" } })).status).toBe(200);
    expect((await admin.json("/api/v1/admin/mappings", { method: "POST", body: { adIds: [ads[1].id, ads[2].id], creatorId: creatorB } })).status).toBe(200);
    expect((await admin.json("/api/v1/admin/ads?status=unmapped")).body.unmappedTotal).toBe(0);
  });

  it("5–6. invites a content team member with selected creators and metrics", async () => {
    const roles = (await admin.json("/api/v1/admin/roles")).body as { id: string; key: string }[];
    memberEmail = "content.member@suroskie.test";
    const r = await admin.json("/api/v1/admin/users", {
      method: "POST",
      body: {
        email: memberEmail, name: "Content Member", roleIds: [roles.find((x) => x.key === "content_manager")!.id], creatorIds: [creatorA],
        metricOverrides: [{ key: "spend", granted: false }, { key: "cost_per_purchase", granted: false }],
        permissionOverrides: [{ key: "reports.export", granted: false }],
      },
    });
    expect(r.status).toBe(200);
    const token = r.body.inviteUrl.split("/invite/")[1];
    const invitePage = await new Session().req(`/invite/${token}`);
    expect(invitePage.status).toBe(200);
    // Public registration is impossible.
    expect((await new Session().json("/api/auth/sign-up/email", { method: "POST", body: { email: "intruder@x.com", password: "intruder-password-1", name: "x" } })).status).toBeGreaterThanOrEqual(400);
    expect((await new Session().json("/api/v1/invitations/accept", { method: "POST", body: { token, name: "Content Member", password: "content-member-passphrase" } })).status).toBe(200);
  });

  it("7. the member signs in and searches for an authorised creator", async () => {
    expect((await member.signIn(memberEmail, "content-member-passphrase")).status).toBe(200);
    const s = await member.json("/api/v1/creators/search?q=");
    expect(s.status).toBe(200);
    expect(s.body.map((c: { id: string }) => c.id)).toEqual([creatorA]);
    expect((await member.json("/api/v1/creators/search?q=Bilal")).body).toEqual([]);
  });

  it("8. sees accurate, date-filtered performance for that creator", async () => {
    const r = await member.json(`/api/v1/reports/creators/${creatorA}?range=custom&from=2026-10-21&to=2026-10-22`);
    expect(r.status).toBe(200);
    // Ad index 0 → n=1: purchases 1/day, value 500/day; 2 days.
    expect(r.body.metrics.purchases).toEqual({ s: "ok", v: 2 });
    expect(r.body.metrics.purchase_value).toEqual({ s: "ok", v: 1000 });
    // ROAS uses spend server-side but spend itself is never sent: (500+500)/(121+122)
    expect(r.body.metrics.roas.v).toBeCloseTo(1000 / 243);
    expect(r.body.range).toMatchObject({ from: "2026-10-21", to: "2026-10-22", reportingTimezone: "Asia/Kolkata", currency: "INR" });
    const page = await member.req(`/creators/${creatorA}?range=last_30d`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Aanya");
  });

  it("9. cannot reach other creators' data or restricted metrics by tampering with URLs or requests", async () => {
    const json = JSON.stringify((await member.json(`/api/v1/reports/creators/${creatorA}?range=last_30d`)).body);
    expect(json).not.toMatch(/"spend"|"cost_per_purchase"|"cpm"/);

    expect((await member.json(`/api/v1/reports/creators/${creatorB}?range=last_30d`)).status).toBe(403);
    const ov = await member.json(`/api/v1/reports/overview?range=last_30d&creator=${creatorB}`);
    expect(ov.status).toBe(200);
    expect(ov.body.metrics.purchases.s).toBe("missing");
    const creatives = await member.json(`/api/v1/reports/creatives?range=last_30d&creator=${creatorB}&sort=spend`);
    expect(creatives.body.rows).toEqual([]);
    expect(creatives.body.sort).not.toBe("spend");
    const adB = (await prisma.ad.findFirstOrThrow({ where: { mapping: { creatorId: creatorB } } })).id;
    expect((await member.json(`/api/v1/reports/compare?kind=ad&ids=${adB}&range=last_30d`)).body.rows).toEqual([]);
    expect((await member.json(`/api/v1/reports/compare?kind=creator&ids=${creatorB}&range=last_30d`)).body.rows).toEqual([]);
    expect((await member.json("/api/v1/export?kind=creatives&range=last_30d")).status).toBe(403);
    for (const path of ["/api/v1/admin/users", "/api/v1/admin/meta/connections", "/api/v1/admin/settings", "/api/v1/admin/ads", "/api/v1/admin/audit", "/api/v1/reports/campaigns"]) {
      expect((await member.json(path)).status, path).toBe(403);
    }
    expect((await member.json("/api/v1/admin/mappings", { method: "POST", body: { adIds: [adB], creatorId: creatorA } })).status).toBe(403);
    // Direct page URLs.
    const otherPage = await member.req(`/creators/${creatorB}`);
    const html = await otherPage.text();
    expect(html).toContain("Creator not found");
    expect(html).not.toContain("Bilal");
    const usersPage = await member.req("/users");
    expect(await usersPage.text()).toMatch(/forbidden|NEXT_REDIRECT/i);
  });

  it("10. shows the last successful synchronisation", async () => {
    const s = await member.json("/api/v1/sync/status");
    expect(s.status).toBe(200);
    expect(Date.now() - Date.parse(s.body.lastSuccessfulSyncAt)).toBeLessThan(10 * 60_000);
    expect(s.body.stale).toBe(false);
    expect(s.body.accounts).toEqual([]); // account-level detail is admin-only
  });
});

describe("security controls", () => {
  it("rejects unauthenticated API calls and redirects unauthenticated pages", async () => {
    expect((await new Session().json("/api/v1/reports/overview")).status).toBe(401);
    const page = await new Session().req("/overview");
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/login");
  });

  it("blocks cross-site state-changing requests", async () => {
    const r = await admin.json("/api/v1/admin/creators", { method: "POST", body: { code: "EVIL", name: "Evil" }, headers: { Origin: "https://evil.example" } });
    expect(r.status).toBe(403);
  });

  it("validates input and returns safe errors", async () => {
    const r = await admin.json("/api/v1/reports/overview?range=custom&from=2026-13-40&to=x");
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toMatch(/prisma|stack|SELECT/i);
    expect((await admin.json("/api/v1/reports/overview?account='%20OR%201=1--")).status).toBe(400);
  });

  it("sets security headers", async () => {
    const r = await new Session().req("/login");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(r.headers.get("x-powered-by")).toBeNull();
  });

  it("revoking access takes effect immediately", async () => {
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } })).id;
    expect((await admin.json(`/api/v1/admin/users/${userId}/actions`, { method: "POST", body: { action: "suspend" } })).status).toBe(200);
    expect((await member.json(`/api/v1/reports/creators/${creatorA}`)).status).toBe(401);
    expect((await member.signIn(memberEmail, "content-member-passphrase")).status).toBeGreaterThanOrEqual(400);
  });

  it("rate-limits repeated sign-in attempts", async () => {
    const s = new Session();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await s.signIn(ADMIN.email, `wrong-${i}-password`)).status);
    expect(statuses).toContain(429);
  });

  it("records sensitive actions in the audit log", async () => {
    const r = await admin.json("/api/v1/admin/audit");
    const actions = new Set(r.body.rows.map((x: { action: string }) => x.action));
    for (const a of ["auth.sign_in", "meta.connection_created", "adaccount.sync_enabled", "creator.created", "mapping.assign", "user.invited", "user.invitation_accepted", "user.suspended", "settings.updated"]) {
      expect(actions.has(a), a).toBe(true);
    }
  });
});

describe("pages render for the admin", () => {
  it.each(["/overview", "/creators", "/creatives", "/creatives/mapping", "/campaigns", "/ad-accounts", "/reports", "/users", "/integrations", "/audit-logs", "/settings"])("%s", async (path) => {
    const r = await admin.req(`${path}?range=last_30d`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).not.toContain("couldn&#x27;t be loaded");
  });

  it("CSV export downloads for the admin", async () => {
    const r = await admin.req("/api/v1/export?kind=creatives&range=last_30d");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    const body = await r.text();
    expect(body.split("\r\n")[0]).toContain("Amount spent");
    expect(body).toContain("Aanya");
  });
});

void BASE;
