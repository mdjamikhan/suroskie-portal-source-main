// Metric catalogue. Client-safe (no server imports) so the UI can use labels and formatting.
//
// Every metric is computed from additive totals stored per ad per day. Ratios are always
// recomputed from summed numerators/denominators (never averaged), which is how Meta computes
// them for an aggregate in Ads Manager.

export type MetricCategory = "DELIVERY" | "CONVERSION" | "VIDEO" | "ENGAGEMENT";
export type MetricUnit = "CURRENCY" | "COUNT" | "PERCENT" | "RATIO" | "SECONDS";

export interface MetricDef {
  key: string;
  label: string;
  description: string;
  formula?: string;
  category: MetricCategory;
  unit: MetricUnit;
  /** Sensitive metrics (cost-revealing) are excluded from content-team defaults. */
  sensitive: boolean;
  higherIsBetter: boolean;
  /** Meta Graph API field(s) the metric depends on. Used to mark metrics unsupported when Meta rejects a field. */
  sourceFields: string[];
}

const d = (m: MetricDef) => m;

export const METRICS: MetricDef[] = [
  // ── Delivery ──
  d({ key: "spend", label: "Amount spent", description: "Total amount spent, as reported by Meta.", category: "DELIVERY", unit: "CURRENCY", sensitive: true, higherIsBetter: true, sourceFields: ["spend"] }),
  d({ key: "impressions", label: "Impressions", description: "Number of times ads were on screen.", category: "DELIVERY", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["impressions"] }),
  d({ key: "reach", label: "Reach", description: "Accounts that saw the ads at least once. Meta de-duplicates reach, so across several days or ads the portal shows the sum of daily reach, which over-counts people reached more than once.", formula: "Σ daily reach (upper bound when aggregated)", category: "DELIVERY", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["reach"] }),
  d({ key: "frequency", label: "Frequency", description: "Average times each account saw the ads. Uses summed daily reach when aggregated, so it is a lower bound.", formula: "Impressions ÷ Reach", category: "DELIVERY", unit: "RATIO", sensitive: false, higherIsBetter: false, sourceFields: ["impressions", "reach"] }),
  d({ key: "cpm", label: "CPM", description: "Cost per 1,000 impressions.", formula: "Spend ÷ Impressions × 1,000", category: "DELIVERY", unit: "CURRENCY", sensitive: true, higherIsBetter: false, sourceFields: ["spend", "impressions"] }),
  d({ key: "clicks", label: "Clicks (all)", description: "All clicks, including likes, profile and expand clicks.", category: "DELIVERY", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["clicks"] }),
  d({ key: "ctr_all", label: "CTR (all)", description: "Clicks (all) as a percentage of impressions.", formula: "Clicks (all) ÷ Impressions × 100", category: "DELIVERY", unit: "PERCENT", sensitive: false, higherIsBetter: true, sourceFields: ["clicks", "impressions"] }),
  d({ key: "cpc_all", label: "CPC (all)", description: "Cost per click (all).", formula: "Spend ÷ Clicks (all)", category: "DELIVERY", unit: "CURRENCY", sensitive: true, higherIsBetter: false, sourceFields: ["spend", "clicks"] }),
  d({ key: "link_clicks", label: "Link clicks", description: "Clicks on links to destinations on or off Meta.", category: "DELIVERY", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["inline_link_clicks"] }),
  d({ key: "ctr", label: "CTR (link)", description: "Link click-through rate.", formula: "Link clicks ÷ Impressions × 100", category: "DELIVERY", unit: "PERCENT", sensitive: false, higherIsBetter: true, sourceFields: ["inline_link_clicks", "impressions"] }),
  d({ key: "cpc", label: "CPC (link)", description: "Cost per link click.", formula: "Spend ÷ Link clicks", category: "DELIVERY", unit: "CURRENCY", sensitive: true, higherIsBetter: false, sourceFields: ["spend", "inline_link_clicks"] }),
  d({ key: "outbound_clicks", label: "Outbound clicks", description: "Clicks that took people off Meta technologies.", category: "DELIVERY", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["outbound_clicks"] }),
  d({ key: "outbound_ctr", label: "Outbound CTR", description: "Outbound clicks as a percentage of impressions.", formula: "Outbound clicks ÷ Impressions × 100", category: "DELIVERY", unit: "PERCENT", sensitive: false, higherIsBetter: true, sourceFields: ["outbound_clicks", "impressions"] }),
  d({ key: "cost_per_outbound_click", label: "Cost per outbound click", description: "Spend divided by outbound clicks.", formula: "Spend ÷ Outbound clicks", category: "DELIVERY", unit: "CURRENCY", sensitive: true, higherIsBetter: false, sourceFields: ["spend", "outbound_clicks"] }),
  d({ key: "landing_page_views", label: "Landing page views", description: "Times a person loaded the landing page after clicking an ad (requires the Meta pixel).", category: "DELIVERY", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "cost_per_landing_page_view", label: "Cost per landing page view", description: "Spend divided by landing page views.", formula: "Spend ÷ Landing page views", category: "DELIVERY", unit: "CURRENCY", sensitive: true, higherIsBetter: false, sourceFields: ["spend", "actions"] }),
  d({ key: "results", label: "Results", description: "Count of the ad set's optimisation event (for example purchases for a purchase-optimised ad set). Only shown when every row in the selection has the same result type.", category: "DELIVERY", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "cost_per_result", label: "Cost per result", description: "Spend divided by results.", formula: "Spend ÷ Results", category: "DELIVERY", unit: "CURRENCY", sensitive: true, higherIsBetter: false, sourceFields: ["spend", "actions"] }),

  // ── Conversions ──
  d({ key: "purchases", label: "Purchases", description: "Meta-attributed purchases across website, app and offline (Meta's omni purchase count) using each ad set's attribution setting. Not the same as unique customers.", category: "CONVERSION", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "purchase_value", label: "Purchase conversion value", description: "Meta-attributed purchase conversion value. Attributed value is not necessarily incremental revenue.", category: "CONVERSION", unit: "CURRENCY", sensitive: false, higherIsBetter: true, sourceFields: ["action_values"] }),
  d({ key: "roas", label: "Purchase ROAS", description: "Return on ad spend from Meta-attributed purchase value.", formula: "Purchase conversion value ÷ Spend", category: "CONVERSION", unit: "RATIO", sensitive: false, higherIsBetter: true, sourceFields: ["action_values", "spend"] }),
  d({ key: "cost_per_purchase", label: "Cost per purchase", description: "Spend divided by Meta-attributed purchases.", formula: "Spend ÷ Purchases", category: "CONVERSION", unit: "CURRENCY", sensitive: true, higherIsBetter: false, sourceFields: ["spend", "actions"] }),
  d({ key: "avg_purchase_value", label: "Avg. purchase value", description: "Purchase conversion value divided by purchases.", formula: "Purchase conversion value ÷ Purchases", category: "CONVERSION", unit: "CURRENCY", sensitive: false, higherIsBetter: true, sourceFields: ["actions", "action_values"] }),
  d({ key: "website_purchases", label: "Website purchases", description: "Purchases tracked by the Meta pixel on the website (offsite_conversion.fb_pixel_purchase).", category: "CONVERSION", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "website_purchase_value", label: "Website purchase value", description: "Conversion value of pixel-tracked website purchases.", category: "CONVERSION", unit: "CURRENCY", sensitive: false, higherIsBetter: true, sourceFields: ["action_values"] }),
  d({ key: "website_roas", label: "Website purchase ROAS", description: "Website purchase value divided by spend.", formula: "Website purchase value ÷ Spend", category: "CONVERSION", unit: "RATIO", sensitive: false, higherIsBetter: true, sourceFields: ["action_values", "spend"] }),
  d({ key: "add_to_cart", label: "Adds to cart", description: "Meta-attributed add-to-cart events.", category: "CONVERSION", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "cost_per_add_to_cart", label: "Cost per add to cart", description: "Spend divided by adds to cart.", formula: "Spend ÷ Adds to cart", category: "CONVERSION", unit: "CURRENCY", sensitive: true, higherIsBetter: false, sourceFields: ["spend", "actions"] }),
  d({ key: "initiate_checkout", label: "Checkouts initiated", description: "Meta-attributed initiate-checkout events.", category: "CONVERSION", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "cost_per_initiate_checkout", label: "Cost per checkout initiated", description: "Spend divided by checkouts initiated.", formula: "Spend ÷ Checkouts initiated", category: "CONVERSION", unit: "CURRENCY", sensitive: true, higherIsBetter: false, sourceFields: ["spend", "actions"] }),
  d({ key: "view_content", label: "Content views", description: "Meta-attributed view-content events.", category: "CONVERSION", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "leads", label: "Leads", description: "Meta-attributed leads (website and on-Meta lead forms).", category: "CONVERSION", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "cost_per_lead", label: "Cost per lead", description: "Spend divided by leads.", formula: "Spend ÷ Leads", category: "CONVERSION", unit: "CURRENCY", sensitive: true, higherIsBetter: false, sourceFields: ["spend", "actions"] }),
  d({ key: "complete_registration", label: "Registrations completed", description: "Meta-attributed complete-registration events.", category: "CONVERSION", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),

  // ── Video ──
  d({ key: "video_3s_views", label: "3-second video plays", description: "Times the video played for at least 3 seconds (or nearly its full length if shorter).", category: "VIDEO", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "hook_rate", label: "Hook rate", description: "Share of impressions that became 3-second plays. A portal-derived metric, not a Meta column.", formula: "3-second plays ÷ Impressions × 100", category: "VIDEO", unit: "PERCENT", sensitive: false, higherIsBetter: true, sourceFields: ["actions", "impressions"] }),
  d({ key: "video_plays", label: "Video plays", description: "Times the video started to play.", category: "VIDEO", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["video_play_actions"] }),
  d({ key: "thruplays", label: "ThruPlays", description: "Plays to completion, or for at least 15 seconds.", category: "VIDEO", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["video_thruplay_watched_actions"] }),
  d({ key: "thruplay_rate", label: "ThruPlay rate", description: "ThruPlays as a share of impressions. Portal-derived.", formula: "ThruPlays ÷ Impressions × 100", category: "VIDEO", unit: "PERCENT", sensitive: false, higherIsBetter: true, sourceFields: ["video_thruplay_watched_actions", "impressions"] }),
  d({ key: "cost_per_thruplay", label: "Cost per ThruPlay", description: "Spend divided by ThruPlays.", formula: "Spend ÷ ThruPlays", category: "VIDEO", unit: "CURRENCY", sensitive: true, higherIsBetter: false, sourceFields: ["spend", "video_thruplay_watched_actions"] }),
  d({ key: "video_p25", label: "Video plays at 25%", description: "Times the video played to 25% of its length.", category: "VIDEO", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["video_p25_watched_actions"] }),
  d({ key: "video_p50", label: "Video plays at 50%", description: "Times the video played to 50% of its length.", category: "VIDEO", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["video_p50_watched_actions"] }),
  d({ key: "video_p75", label: "Video plays at 75%", description: "Times the video played to 75% of its length.", category: "VIDEO", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["video_p75_watched_actions"] }),
  d({ key: "video_p95", label: "Video plays at 95%", description: "Times the video played to 95% of its length.", category: "VIDEO", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["video_p95_watched_actions"] }),
  d({ key: "video_p100", label: "Video plays at 100%", description: "Times the video played to 100% of its length.", category: "VIDEO", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["video_p100_watched_actions"] }),
  d({ key: "video_avg_time", label: "Avg. video play time", description: "Average play time. Across several days or ads this is a play-weighted average of Meta's daily averages (an estimate).", category: "VIDEO", unit: "SECONDS", sensitive: false, higherIsBetter: true, sourceFields: ["video_avg_time_watched_actions"] }),

  // ── Engagement ──
  d({ key: "post_engagement", label: "Post engagements", description: "All actions people took involving the ads.", category: "ENGAGEMENT", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "post_reactions", label: "Post reactions", description: "Reactions on the ads.", category: "ENGAGEMENT", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "post_comments", label: "Post comments", description: "Comments on the ads.", category: "ENGAGEMENT", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "post_shares", label: "Post shares", description: "Shares of the ads.", category: "ENGAGEMENT", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
  d({ key: "post_saves", label: "Post saves", description: "Saves of the ads.", category: "ENGAGEMENT", unit: "COUNT", sensitive: false, higherIsBetter: true, sourceFields: ["actions"] }),
];

export const METRIC_KEYS = METRICS.map((m) => m.key);
export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m]));
export const SENSITIVE_METRIC_KEYS = METRICS.filter((m) => m.sensitive).map((m) => m.key);
export const NON_SENSITIVE_METRIC_KEYS = METRICS.filter((m) => !m.sensitive).map((m) => m.key);

export function isMetricKey(k: string): boolean {
  return k in METRIC_BY_KEY;
}

/**
 * Metrics from which a hidden metric can be back-calculated. Shown as a warning in the
 * permission editor (e.g. ROAS + purchase value together reveal spend).
 */
export function inferableHiddenMetrics(visible: Set<string>): string[] {
  const out: string[] = [];
  const has = (...k: string[]) => k.every((x) => visible.has(x));
  if (!visible.has("spend")) {
    if (has("roas", "purchase_value")) out.push("spend (from ROAS and purchase value)");
    else if (has("cost_per_purchase", "purchases")) out.push("spend (from cost per purchase and purchases)");
    else if (has("cpm", "impressions")) out.push("spend (from CPM and impressions)");
    else if (has("cpc", "link_clicks")) out.push("spend (from CPC and link clicks)");
  }
  return out;
}
