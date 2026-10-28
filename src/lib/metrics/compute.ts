// Pure metric computation from summed totals. Client-safe.
import { METRICS, METRIC_BY_KEY } from "./catalog";

/**
 * A metric value with explicit state. The portal never turns "unknown" into 0:
 *  - ok:              a real value (0 is a real value)
 *  - not_applicable:  the metric does not apply here (e.g. ratio with a zero denominator, video metric for image ads)
 *  - unavailable:     Meta did not provide it / it is unsupported for this account / mixed currencies
 *  - missing:         no synced data exists for the selection
 */
export type MetricValue =
  | { s: "ok"; v: number; approx?: "upper_bound" | "lower_bound" | "estimate" }
  | { s: "not_applicable"; reason: string }
  | { s: "unavailable"; reason: string }
  | { s: "missing"; reason: string };

export type MetricMap = Record<string, MetricValue>;

/** Additive totals over a set of (ad, day) insight rows. Nullable sums are null when every row was null. */
export interface Totals {
  rowCount: number;
  adCount: number;
  dayCount: number;
  currencies: string[];
  spend: number;
  impressions: number;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  outboundClicks: number | null;
  landingPageViews: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  websitePurchases: number | null;
  websitePurchaseValue: number | null;
  addToCart: number | null;
  initiateCheckout: number | null;
  viewContent: number | null;
  leads: number | null;
  completeRegistration: number | null;
  results: number | null;
  resultTypes: string[];
  videoPlays: number | null;
  video3sViews: number | null;
  thruplays: number | null;
  videoP25: number | null;
  videoP50: number | null;
  videoP75: number | null;
  videoP95: number | null;
  videoP100: number | null;
  /** Σ(daily avg play time × daily video plays) and Σ(daily video plays) for rows that have an average. */
  videoAvgTimeWeighted: number | null;
  videoAvgTimeWeight: number | null;
  postEngagement: number | null;
  postReactions: number | null;
  postComments: number | null;
  postShares: number | null;
  postSaves: number | null;
}

export function emptyTotals(): Totals {
  return {
    rowCount: 0, adCount: 0, dayCount: 0, currencies: [], spend: 0, impressions: 0, reach: null, clicks: null,
    linkClicks: null, outboundClicks: null, landingPageViews: null, purchases: null, purchaseValue: null,
    websitePurchases: null, websitePurchaseValue: null, addToCart: null, initiateCheckout: null, viewContent: null,
    leads: null, completeRegistration: null, results: null, resultTypes: [], videoPlays: null, video3sViews: null,
    thruplays: null, videoP25: null, videoP50: null, videoP75: null, videoP95: null, videoP100: null,
    videoAvgTimeWeighted: null, videoAvgTimeWeight: null, postEngagement: null, postReactions: null,
    postComments: null, postShares: null, postSaves: null,
  };
}

const ok = (v: number, approx?: "upper_bound" | "lower_bound" | "estimate"): MetricValue =>
  approx ? { s: "ok", v, approx } : { s: "ok", v };
const na = (reason: string): MetricValue => ({ s: "not_applicable", reason });
const unavailable = (reason: string): MetricValue => ({ s: "unavailable", reason });

/** Safe division: null/zero denominators produce not_applicable, never Infinity/NaN. */
function ratio(num: number | null, den: number | null, scale: number, denLabel: string): MetricValue {
  if (num === null) return unavailable("Numerator not reported by Meta");
  if (den === null) return unavailable(`${denLabel} not reported by Meta`);
  if (den === 0) return na(`No ${denLabel.toLowerCase()} in this selection`);
  return ok((num / den) * scale);
}

function count(v: number | null, whenNull: MetricValue): MetricValue {
  return v === null ? whenNull : ok(v);
}

export interface ComputeOptions {
  /** Metric keys Meta has rejected for the connected account(s). */
  unsupported?: Set<string>;
}

export function computeMetrics(t: Totals, opts: ComputeOptions = {}): MetricMap {
  const out: MetricMap = {};
  if (t.rowCount === 0) {
    for (const m of METRICS) out[m.key] = { s: "missing", reason: "No synced data for this selection and date range" };
    return out;
  }

  const aggregated = t.adCount > 1 || t.dayCount > 1;
  const notVideo = na("No video delivery in this selection");
  const notReported = unavailable("Not reported by Meta for this selection");
  const spend = t.spend;

  out.spend = ok(spend);
  out.impressions = ok(t.impressions);
  out.reach = t.reach === null ? notReported : ok(t.reach, aggregated ? "upper_bound" : undefined);
  out.frequency =
    t.reach === null ? notReported : t.reach === 0 ? na("No reach") : ok(t.impressions / t.reach, aggregated ? "lower_bound" : undefined);
  out.cpm = ratio(spend, t.impressions, 1000, "Impressions");
  out.clicks = count(t.clicks, notReported);
  out.ctr_all = ratio(t.clicks, t.impressions, 100, "Impressions");
  out.cpc_all = ratio(spend, t.clicks, 1, "Clicks");
  out.link_clicks = count(t.linkClicks, notReported);
  out.ctr = ratio(t.linkClicks, t.impressions, 100, "Impressions");
  out.cpc = ratio(spend, t.linkClicks, 1, "Link clicks");
  out.outbound_clicks = count(t.outboundClicks, notReported);
  out.outbound_ctr = ratio(t.outboundClicks, t.impressions, 100, "Impressions");
  out.cost_per_outbound_click = ratio(spend, t.outboundClicks, 1, "Outbound clicks");
  out.landing_page_views = count(t.landingPageViews, notReported);
  out.cost_per_landing_page_view = ratio(spend, t.landingPageViews, 1, "Landing page views");

  if (t.resultTypes.length > 1) {
    out.results = na(`Mixed result types (${t.resultTypes.join(", ")}) cannot be added together`);
    out.cost_per_result = out.results;
  } else if (t.resultTypes.length === 0 || t.results === null) {
    out.results = unavailable("Result type could not be derived from the ad set optimisation goal");
    out.cost_per_result = out.results;
  } else {
    out.results = ok(t.results);
    out.cost_per_result = ratio(spend, t.results, 1, "Results");
  }

  out.purchases = count(t.purchases, notReported);
  out.purchase_value = count(t.purchaseValue, notReported);
  out.roas = ratio(t.purchaseValue, spend, 1, "Spend");
  out.cost_per_purchase = ratio(spend, t.purchases, 1, "Purchases");
  out.avg_purchase_value = ratio(t.purchaseValue, t.purchases, 1, "Purchases");
  out.website_purchases = count(t.websitePurchases, notReported);
  out.website_purchase_value = count(t.websitePurchaseValue, notReported);
  out.website_roas = ratio(t.websitePurchaseValue, spend, 1, "Spend");
  out.add_to_cart = count(t.addToCart, notReported);
  out.cost_per_add_to_cart = ratio(spend, t.addToCart, 1, "Adds to cart");
  out.initiate_checkout = count(t.initiateCheckout, notReported);
  out.cost_per_initiate_checkout = ratio(spend, t.initiateCheckout, 1, "Checkouts initiated");
  out.view_content = count(t.viewContent, notReported);
  out.leads = count(t.leads, notReported);
  out.cost_per_lead = ratio(spend, t.leads, 1, "Leads");
  out.complete_registration = count(t.completeRegistration, notReported);

  const hasVideo = t.videoPlays !== null || t.thruplays !== null || t.video3sViews !== null;
  const vid = (v: number | null) => (hasVideo ? count(v, ok(0)) : notVideo);
  out.video_3s_views = vid(t.video3sViews);
  out.hook_rate = hasVideo ? ratio(t.video3sViews ?? 0, t.impressions, 100, "Impressions") : notVideo;
  out.video_plays = vid(t.videoPlays);
  out.thruplays = vid(t.thruplays);
  out.thruplay_rate = hasVideo ? ratio(t.thruplays ?? 0, t.impressions, 100, "Impressions") : notVideo;
  out.cost_per_thruplay = hasVideo ? ratio(spend, t.thruplays ?? 0, 1, "ThruPlays") : notVideo;
  out.video_p25 = vid(t.videoP25);
  out.video_p50 = vid(t.videoP50);
  out.video_p75 = vid(t.videoP75);
  out.video_p95 = vid(t.videoP95);
  out.video_p100 = vid(t.videoP100);
  if (!hasVideo) out.video_avg_time = notVideo;
  else if (!t.videoAvgTimeWeight) out.video_avg_time = na("No video plays");
  else out.video_avg_time = ok((t.videoAvgTimeWeighted ?? 0) / t.videoAvgTimeWeight, t.rowCount > 1 ? "estimate" : undefined);

  out.post_engagement = count(t.postEngagement, notReported);
  out.post_reactions = count(t.postReactions, notReported);
  out.post_comments = count(t.postComments, notReported);
  out.post_shares = count(t.postShares, notReported);
  out.post_saves = count(t.postSaves, notReported);

  // Money cannot be added across currencies.
  if (t.currencies.length > 1) {
    const mixed = unavailable(`Mixed currencies (${t.currencies.join(", ")}) — filter to one ad account currency`);
    for (const m of METRICS) {
      if (m.unit === "CURRENCY" || m.key === "roas" || m.key === "website_roas") out[m.key] = mixed;
    }
  }

  if (opts.unsupported) {
    for (const key of opts.unsupported) {
      if (METRIC_BY_KEY[key]) out[key] = unavailable("Not supported by the connected Meta account or API version");
    }
  }
  return out;
}

/** Keep only the metric keys the viewer is allowed to see. Used on every server response. */
export function projectMetrics(map: MetricMap, allowed: ReadonlySet<string>): MetricMap {
  const out: MetricMap = {};
  for (const [k, v] of Object.entries(map)) if (allowed.has(k)) out[k] = v;
  return out;
}

export function numericValue(v: MetricValue | undefined): number | null {
  return v && v.s === "ok" ? v.v : null;
}

/** Percentage change between two periods; null when not computable. */
export function percentChange(current: MetricValue | undefined, previous: MetricValue | undefined): number | null {
  const c = numericValue(current);
  const p = numericValue(previous);
  if (c === null || p === null || p === 0) return null;
  return ((c - p) / Math.abs(p)) * 100;
}
