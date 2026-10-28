import { describe, expect, it } from "vitest";
import { creativeKind, deriveResult, insightHash, parseBudget, parseInsightRow, parseMetaTime } from "@/lib/meta/parse";
import { classifyMetaError, MetaApiError, rejectedField } from "@/lib/meta/errors";
import { currencyOffset } from "@/lib/meta/fields";

const row = {
  campaign_id: "c", adset_id: "s", ad_id: "a", date_start: "2026-10-01", account_currency: "INR", spend: "1234.56", impressions: "1000", reach: "800",
  inline_link_clicks: "20",
  actions: [
    { action_type: "omni_purchase", value: "3" },
    { action_type: "purchase", value: "3" },
    { action_type: "offsite_conversion.fb_pixel_purchase", value: "2" },
    { action_type: "landing_page_view", value: "15" },
  ],
  action_values: [{ action_type: "omni_purchase", value: "4500.5" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "3000" }],
};

describe("insight parsing", () => {
  it("does not double count overlapping purchase action types", () => {
    const p = parseInsightRow(row, "INR");
    expect(p.purchases).toBe(3);
    expect(p.purchaseValue).toBe(4500.5);
    expect(p.websitePurchases).toBe(2);
    expect(p.spend).toBe(1234.56);
  });
  it("treats a missing conversion action on a delivered row as zero, but missing video fields as null", () => {
    const p = parseInsightRow(row, "INR");
    expect(p.addToCart).toBe(0);
    expect(p.leads).toBe(0);
    expect(p.thruplays).toBeNull();
    expect(p.videoP25).toBeNull();
    expect(p.video3sViews).toBeNull();
  });
  it("sums video list fields", () => {
    const p = parseInsightRow({ ...row, video_thruplay_watched_actions: [{ action_type: "video_view", value: "40" }], video_play_actions: [{ action_type: "video_view", value: "100" }] }, "INR");
    expect(p.thruplays).toBe(40);
    expect(p.videoPlays).toBe(100);
    expect(p.video3sViews).toBe(0);
  });
  it("derives results from the optimisation goal", () => {
    const p = parseInsightRow(row, "INR");
    expect(deriveResult({ optimizationGoal: "OFFSITE_CONVERSIONS", customEventType: "PURCHASE" }, p)).toEqual({ results: 3, resultType: "purchase" });
    expect(deriveResult({ optimizationGoal: "LANDING_PAGE_VIEWS", customEventType: null }, p)).toEqual({ results: 15, resultType: "landing_page_view" });
    expect(deriveResult({ optimizationGoal: "SOMETHING_NEW", customEventType: null }, p)).toEqual({ results: null, resultType: null });
  });
  it("hash changes only when values change", () => {
    const a = parseInsightRow(row, "INR");
    const b = parseInsightRow({ ...row, ad_name: "renamed" }, "INR");
    const c = parseInsightRow({ ...row, spend: "1300" }, "INR");
    expect(insightHash({ ...a, results: 1, resultType: "x" })).toBe(insightHash({ ...b, results: 1, resultType: "x" }));
    expect(insightHash({ ...a, results: 1, resultType: "x" })).not.toBe(insightHash({ ...c, results: 1, resultType: "x" }));
  });
  it("budgets are converted from minor units", () => {
    expect(parseBudget("500000", "INR")).toBe(5000);
    expect(parseBudget("5000", "JPY")).toBe(5000);
    expect(currencyOffset("usd")).toBe(100);
  });
  it("parses Meta timestamps with compact offsets", () => {
    expect(parseMetaTime("2026-03-01T10:00:00+0530")?.toISOString()).toBe("2026-03-01T04:30:00.000Z");
    expect(parseMetaTime("garbage")).toBeNull();
  });
  it("classifies creative types", () => {
    expect(creativeKind({ id: "1", object_type: "VIDEO" })).toBe("VIDEO");
    expect(creativeKind({ id: "1", object_story_spec: { link_data: { child_attachments: [{}, {}] } } })).toBe("CAROUSEL");
    expect(creativeKind({ id: "1", image_url: "x" })).toBe("IMAGE");
    expect(creativeKind({ id: "1" })).toBe("UNKNOWN");
  });
});

describe("Meta error classification", () => {
  it.each([
    [400, 190, "auth"], [400, 102, "auth"], [400, 4, "rate_limit"], [400, 17, "rate_limit"], [400, 613, "rate_limit"], [400, 80004, "rate_limit"],
    [400, 10, "permission"], [403, 200, "permission"], [500, 2, "transient"], [400, 1, "transient"], [400, 100, "invalid_request"],
  ])("HTTP %i code %i → %s", (status, code, kind) => {
    expect(classifyMetaError(status, { code })).toBe(kind);
  });
  it("detects a rejected field so it can be dropped", () => {
    const e = new MetaApiError({ httpStatus: 400, body: { code: 100, message: "(#100) video_p95_watched_actions is not valid for fields param." } });
    expect(rejectedField(e, ["spend", "video_p95_watched_actions"])).toBe("video_p95_watched_actions");
    expect(rejectedField(new MetaApiError({ httpStatus: 400, body: { code: 100, message: "Invalid time range" } }), ["spend"])).toBeNull();
  });
});
