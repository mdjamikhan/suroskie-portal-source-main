import { beforeAll, describe, expect, it } from "vitest";
import { ctxFor, makeFixture, makeUser, RANGE, resetDb } from "../helpers/db";
import { compareEntities, getCampaignReport, getCreatives, getCreatorPerformance, getOverview, listCreators } from "@/lib/reporting/service";
import { ForbiddenError } from "@/lib/errors";

let f: Awaited<ReturnType<typeof makeFixture>>;
let admin: string, contentA: string, viewerB: string, mmAcc2: string, noExport: string;

beforeAll(async () => {
  await resetDb();
  f = await makeFixture();
  admin = await makeUser({ email: "admin@test", role: "super_admin" });
  contentA = await makeUser({ email: "ca@test", role: "content_manager", creators: [f.creatorA.id], metricOverrides: [{ key: "spend", granted: false }] });
  viewerB = await makeUser({ email: "vb@test", role: "creator_viewer", creators: [f.creatorB.id] });
  mmAcc2 = await makeUser({ email: "mm@test", role: "marketing_manager", accounts: [f.acc2.id] });
  noExport = await makeUser({ email: "ne@test", role: "content_manager", creators: [f.creatorA.id], permissionOverrides: [{ key: "reports.export", granted: false }] });
});

const v = (m: Record<string, { s: string; v?: number }>, k: string) => (m[k]?.s === "ok" ? m[k].v : m[k]?.s);

describe("aggregation accuracy (super admin)", () => {
  it("totals real accounts only and never mixes demo data", async () => {
    const o = await getOverview(await ctxFor(admin), RANGE);
    // Real ads: A1 1000 + A2 3000 + B1 2000 + U 500 + C 700 = 7200/day × 3 days
    expect(v(o.metrics, "spend")).toBe(21600);
    expect(v(o.metrics, "purchases")).toBe((10 + 2 + 4 + 0 + 1) * 3);
    expect(v(o.metrics, "purchase_value")).toBe((5000 + 3000 + 2000 + 0 + 1400) * 3);
    expect(v(o.metrics, "roas")).toBeCloseTo(11400 / 7200);
    expect(v(o.metrics, "cost_per_purchase")).toBeCloseTo(7200 / 17);
  });

  it("filters by date range inclusively", async () => {
    const o = await getOverview(await ctxFor(admin), { range: "custom", from: "2026-10-02", to: "2026-10-02" });
    expect(v(o.metrics, "spend")).toBe(7200);
  });

  it("creator ranking credits each ad exactly once (no double counting)", async () => {
    const o = await getOverview(await ctxFor(admin), RANGE);
    const byName = Object.fromEntries(o.creatorRanking.rows.map((r) => [r.creator?.name, v(r.metrics, "spend")]));
    expect(byName["Creator A"]).toBe(4000 * 3);
    expect(byName["Creator B"]).toBe(2700 * 3);
    const sum = o.creatorRanking.rows.reduce((s, r) => s + Number(v(r.metrics, "spend")), 0);
    expect(sum).toBe(21600 - 1500); // total minus the unmapped ad
  });

  it("creator page ROAS is computed from summed value ÷ summed spend", async () => {
    const c = await getCreatorPerformance(await ctxFor(admin), f.creatorA.id, RANGE);
    expect(v(c.metrics, "roas")).toBeCloseTo((5000 + 3000) / (1000 + 3000)); // 2, not avg(5,1)=3
    expect(c.creatives.rows).toHaveLength(2);
  });

  it("sorts and paginates creatives server-side", async () => {
    const p1 = await getCreatives(await ctxFor(admin), { ...RANGE, sort: "roas", dir: "desc", pageSize: "1", minSpend: "0", minPurchases: "0" });
    expect(p1.total).toBe(5); // A1, A2, B1, U, C — demo ad excluded
    expect(p1.rows[0].id).toBe(f.adA1.id);
    const p2 = await getCreatives(await ctxFor(admin), { ...RANGE, sort: "roas", dir: "desc", pageSize: "1", page: "2", minSpend: "0", minPurchases: "0" });
    expect(p2.rows[0].id).not.toBe(f.adA1.id);
  });

  it("minimum spend/purchase thresholds exclude under-tested creatives", async () => {
    const r = await getCreatives(await ctxFor(admin), { ...RANGE, sort: "roas", minSpend: "5000", minPurchases: "10" });
    // 3-day totals: A1 3,000 spend/30 purchases; A2 9,000/6; B1 6,000/12; C 2,100/3 → only B1 qualifies
    expect(r.rows.map((x) => x.id)).toEqual([f.adB1.id]);
  });
});

describe("creator-level restrictions", () => {
  it("content manager sees only their creator's data, even if the request asks for another creator", async () => {
    const ctx = await ctxFor(contentA);
    const o = await getOverview(ctx, { ...RANGE, creator: f.creatorB.id });
    expect(v(o.metrics, "purchases")).toBe("missing"); // B filtered out by scope → nothing
    const own = await getOverview(ctx, RANGE);
    expect(v(own.metrics, "purchases")).toBe(12 * 3);
    expect(own.creatorRanking.rows.map((r) => r.creator?.id)).toEqual([f.creatorA.id]);
    expect(own.counts.unmappedAds).toBeNull();
  });

  it("cannot open another creator's page", async () => {
    await expect(getCreatorPerformance(await ctxFor(contentA), f.creatorB.id, RANGE)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creator list and compare only include assigned creators", async () => {
    const list = await listCreators(await ctxFor(viewerB), RANGE).catch((e) => e);
    // creator_viewer has reports.creators
    expect(list.rows.map((r: { id: string }) => r.id)).toEqual([f.creatorB.id]);
    const cmp = await compareEntities(await ctxFor(contentA), RANGE, "ad", [f.adA1.id, f.adB1.id, f.adU.id]).catch((e) => e);
    // content manager has reports.creatives
    expect(cmp.rows.map((r: { id: string }) => r.id)).toEqual([f.adA1.id]);
  });

  it("strips restricted metrics from every response", async () => {
    const o = await getOverview(await ctxFor(contentA), RANGE);
    expect(o.metrics.spend).toBeUndefined();
    expect(o.metrics.cpm).toBeUndefined(); // sensitive, not in content-manager defaults
    expect(o.metrics.roas).toBeDefined();
    for (const p of o.timeseries) expect(p.metrics.spend).toBeUndefined();
    for (const r of o.creatorRanking.rows) expect(r.metrics.spend).toBeUndefined();
    const viewer = await getCreatorPerformance(await ctxFor(viewerB), f.creatorB.id, RANGE);
    expect(Object.keys(viewer.metrics).sort()).toEqual(["ctr", "hook_rate", "impressions", "link_clicks", "purchases", "roas", "thruplays", "video_3s_views", "video_avg_time"].sort());
  });

  it("never sorts by a hidden metric", async () => {
    const r = await getCreatives(await ctxFor(contentA), { ...RANGE, sort: "spend" });
    expect(r.sort).not.toBe("spend");
  });

  it("creator viewer cannot access reports outside their permission", async () => {
    await expect(getOverview(await ctxFor(viewerB), RANGE)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCampaignReport(await ctxFor(viewerB), RANGE, "campaign")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ad-account scope limits a marketing manager to assigned accounts", async () => {
    const o = await getOverview(await ctxFor(mmAcc2), { ...RANGE, account: f.acc1.id });
    expect(v(o.metrics, "spend")).toBe("missing"); // asked for an unassigned account → nothing
    const own = await getOverview(await ctxFor(mmAcc2), RANGE);
    expect(v(own.metrics, "spend")).toBe(700 * 3);
  });

  it("date permissions clamp the range server-side", async () => {
    const limited = await makeUser({ email: "lim@test", role: "content_manager", creators: [f.creatorA.id], maxLookbackDays: 5 });
    const o = await getOverview(await ctxFor(limited), RANGE);
    expect(o.range.empty).toBe(true);
    expect(v(o.metrics, "purchases")).toBe("missing");
  });

  it("export permission is enforced", async () => {
    const ctx = await ctxFor(noExport);
    expect(ctx.permissions.has("reports.export")).toBe(false);
  });
});
