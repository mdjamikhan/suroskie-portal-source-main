import { describe, expect, it } from "vitest";
import { computeMetrics, emptyTotals, percentChange, projectMetrics, type Totals } from "@/lib/metrics/compute";
import { formatMetric, formatCurrency } from "@/lib/metrics/format";
import { inferableHiddenMetrics } from "@/lib/metrics/catalog";

const t = (p: Partial<Totals>): Totals => ({ ...emptyTotals(), rowCount: 2, adCount: 1, dayCount: 2, currencies: ["INR"], ...p });

describe("metric calculations", () => {
  it("computes ROAS as purchase value ÷ spend from totals (not an average of ratios)", () => {
    // Two rows: (spend 1000, value 5000) and (spend 3000, value 3000): avg of ratios would be 3.0
    const m = computeMetrics(t({ spend: 4000, purchaseValue: 8000, purchases: 12 }));
    expect(m.roas).toEqual({ s: "ok", v: 2 });
  });

  it("computes cost per purchase as spend ÷ purchases", () => {
    const m = computeMetrics(t({ spend: 4000, purchases: 16, purchaseValue: 0 }));
    expect(m.cost_per_purchase).toEqual({ s: "ok", v: 250 });
  });

  it("never divides by zero: zero denominators are 'not applicable', not Infinity or 0", () => {
    const m = computeMetrics(t({ spend: 0, impressions: 0, purchases: 0, purchaseValue: 0, linkClicks: 0 }));
    expect(m.roas.s).toBe("not_applicable");
    expect(m.cost_per_purchase.s).toBe("not_applicable");
    expect(m.cpm.s).toBe("not_applicable");
    expect(m.ctr.s).toBe("not_applicable");
    expect(m.spend).toEqual({ s: "ok", v: 0 }); // zero is a real value
  });

  it("distinguishes missing data (no rows) from zero", () => {
    const m = computeMetrics(emptyTotals());
    expect(m.spend.s).toBe("missing");
    expect(m.purchases.s).toBe("missing");
  });

  it("marks metrics Meta did not report as unavailable", () => {
    const m = computeMetrics(t({ spend: 10, impressions: 100, clicks: null, outboundClicks: null }));
    expect(m.clicks.s).toBe("unavailable");
    expect(m.outbound_ctr.s).toBe("unavailable");
  });

  it("video metrics are not applicable when no video delivered", () => {
    const m = computeMetrics(t({ spend: 10, impressions: 100 }));
    expect(m.thruplays.s).toBe("not_applicable");
    expect(m.hook_rate.s).toBe("not_applicable");
  });

  it("reach is labelled an upper bound when summed across days/ads; single ad-day is exact", () => {
    expect(computeMetrics(t({ impressions: 100, reach: 80 })).reach).toEqual({ s: "ok", v: 80, approx: "upper_bound" });
    expect(computeMetrics(t({ rowCount: 1, dayCount: 1, impressions: 100, reach: 80 })).reach).toEqual({ s: "ok", v: 80 });
    expect(computeMetrics(t({ impressions: 100, reach: 80 })).frequency).toMatchObject({ approx: "lower_bound" });
  });

  it("refuses to add money across currencies", () => {
    const m = computeMetrics(t({ currencies: ["INR", "USD"], spend: 10, purchaseValue: 20, purchases: 1 }));
    expect(m.spend.s).toBe("unavailable");
    expect(m.roas.s).toBe("unavailable");
    expect(m.purchases).toEqual({ s: "ok", v: 1 });
  });

  it("does not add results of different types", () => {
    const m = computeMetrics(t({ spend: 10, results: 5, resultTypes: ["purchase", "thruplay"] }));
    expect(m.results.s).toBe("not_applicable");
    expect(computeMetrics(t({ spend: 10, results: 5, resultTypes: ["purchase"] })).cost_per_result).toEqual({ s: "ok", v: 2 });
  });

  it("marks metrics unsupported by the connected API as unavailable", () => {
    const m = computeMetrics(t({ spend: 1, videoP95: 4, videoPlays: 10 }), { unsupported: new Set(["video_p95"]) });
    expect(m.video_p95.s).toBe("unavailable");
  });

  it("projects only allowed metrics", () => {
    const m = computeMetrics(t({ spend: 100, purchases: 2, purchaseValue: 300 }));
    const p = projectMetrics(m, new Set(["purchases", "roas"]));
    expect(Object.keys(p).sort()).toEqual(["purchases", "roas"]);
    expect(p.spend).toBeUndefined();
  });

  it("CTR/CPC/CPM follow Meta definitions", () => {
    const m = computeMetrics(t({ spend: 500, impressions: 10000, linkClicks: 150, clicks: 300 }));
    expect(m.ctr).toEqual({ s: "ok", v: 1.5 });
    expect(m.cpc).toEqual({ s: "ok", v: 500 / 150 });
    expect(m.cpm).toEqual({ s: "ok", v: 50 });
    expect(m.ctr_all).toEqual({ s: "ok", v: 3 });
  });

  it("percent change handles zero previous", () => {
    expect(percentChange({ s: "ok", v: 120 }, { s: "ok", v: 100 })).toBeCloseTo(20);
    expect(percentChange({ s: "ok", v: 1 }, { s: "ok", v: 0 })).toBeNull();
    expect(percentChange({ s: "ok", v: 1 }, { s: "missing", reason: "" })).toBeNull();
  });
});

describe("formatting", () => {
  it("uses INR and Indian digit grouping", () => {
    expect(formatCurrency(1234567)).toBe("₹12,34,567");
  });
  it("renders states distinctly", () => {
    expect(formatMetric("spend", { s: "ok", v: 0 }).text).toBe("₹0");
    expect(formatMetric("spend", { s: "unavailable", reason: "x" }).text).toBe("—");
    expect(formatMetric("roas", { s: "not_applicable", reason: "x" }).text).toBe("n/a");
    expect(formatMetric("spend", { s: "missing", reason: "x" }).text).toBe("No data");
    expect(formatMetric("reach", { s: "ok", v: 10, approx: "upper_bound" }).text).toBe("≤ 10");
  });
  it("warns when hidden spend can be derived", () => {
    expect(inferableHiddenMetrics(new Set(["roas", "purchase_value"]))[0]).toMatch(/spend/);
    expect(inferableHiddenMetrics(new Set(["roas"]))).toEqual([]);
  });
});
