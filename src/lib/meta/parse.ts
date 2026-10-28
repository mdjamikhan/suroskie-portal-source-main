// Pure parsing of Graph API payloads into database-ready values.
import { createHash } from "node:crypto";
import { currencyOffset } from "./fields";

export interface ActionStat {
  action_type: string;
  value: string;
}

export interface RawInsightRow {
  account_id?: string;
  campaign_id: string;
  campaign_name?: string;
  adset_id: string;
  adset_name?: string;
  ad_id: string;
  ad_name?: string;
  date_start: string;
  date_stop?: string;
  account_currency?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  outbound_clicks?: ActionStat[];
  actions?: ActionStat[];
  action_values?: ActionStat[];
  video_play_actions?: ActionStat[];
  video_thruplay_watched_actions?: ActionStat[];
  video_p25_watched_actions?: ActionStat[];
  video_p50_watched_actions?: ActionStat[];
  video_p75_watched_actions?: ActionStat[];
  video_p95_watched_actions?: ActionStat[];
  video_p100_watched_actions?: ActionStat[];
  video_avg_time_watched_actions?: ActionStat[];
  objective?: string;
  optimization_goal?: string;
  attribution_setting?: string;
  // Breakdown dimensions
  age?: string;
  gender?: string;
  publisher_platform?: string;
  platform_position?: string;
  device_platform?: string;
  country?: string;
  region?: string;
}

function num(v: string | undefined | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Meta reports overlapping action types for the same conversion (e.g. omni_purchase, purchase,
 * offsite_conversion.fb_pixel_purchase). Summing them would double count, so each metric takes
 * the FIRST present type from a precedence list.
 */
export const ACTION_PRECEDENCE = {
  purchases: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  websitePurchases: ["offsite_conversion.fb_pixel_purchase"],
  addToCart: ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"],
  initiateCheckout: ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"],
  viewContent: ["omni_view_content", "view_content", "offsite_conversion.fb_pixel_view_content"],
  leads: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  completeRegistration: ["omni_complete_registration", "complete_registration", "offsite_conversion.fb_pixel_complete_registration"],
  landingPageViews: ["landing_page_view", "omni_landing_page_view"],
  video3sViews: ["video_view"],
  postEngagement: ["post_engagement"],
  postReactions: ["post_reaction"],
  postComments: ["comment"],
  postShares: ["post"],
  postSaves: ["onsite_conversion.post_save"],
} as const;

export function pickAction(list: ActionStat[] | undefined, types: readonly string[]): number | null {
  if (!list) return null;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return num(hit.value);
  }
  return null;
}

/** Sum every entry of a single-type list field like video_p25_watched_actions. Null if Meta omitted the field. */
export function sumList(list: ActionStat[] | undefined): number | null {
  if (!list) return null;
  return list.reduce((s, a) => s + (num(a.value) ?? 0), 0);
}

export interface AdSetGoal {
  optimizationGoal: string | null;
  customEventType: string | null;
}

/**
 * Derive "results" from the ad set's optimisation goal (and promoted object event), mirroring
 * how Ads Manager's Results column is defined. Unknown goals yield null (shown as unavailable).
 */
export function deriveResult(goal: AdSetGoal, v: ParsedInsight): { results: number | null; resultType: string | null } {
  const g = goal.optimizationGoal;
  const ev = goal.customEventType;
  const pick = (type: string, value: number | null) => ({ results: value ?? 0, resultType: type });
  switch (g) {
    case "OFFSITE_CONVERSIONS":
    case "VALUE":
      switch (ev) {
        case null:
        case "PURCHASE":
          return pick("purchase", v.purchases);
        case "ADD_TO_CART":
          return pick("add_to_cart", v.addToCart);
        case "INITIATED_CHECKOUT":
          return pick("initiate_checkout", v.initiateCheckout);
        case "LEAD":
          return pick("lead", v.leads);
        case "COMPLETE_REGISTRATION":
          return pick("complete_registration", v.completeRegistration);
        case "CONTENT_VIEW":
          return pick("view_content", v.viewContent);
        default:
          return { results: null, resultType: null };
      }
    case "LINK_CLICKS":
      return pick("link_click", v.linkClicks);
    case "LANDING_PAGE_VIEWS":
      return pick("landing_page_view", v.landingPageViews);
    case "THRUPLAY":
      return pick("thruplay", v.thruplays);
    case "IMPRESSIONS":
      return pick("impressions", v.impressions);
    case "REACH":
      return pick("reach", v.reach);
    case "POST_ENGAGEMENT":
      return pick("post_engagement", v.postEngagement);
    case "LEAD_GENERATION":
    case "QUALITY_LEAD":
      return pick("lead", v.leads);
    default:
      return { results: null, resultType: null };
  }
}

export interface ParsedInsight {
  metaAdId: string;
  metaAdSetId: string;
  metaCampaignId: string;
  adName: string | null;
  adSetName: string | null;
  campaignName: string | null;
  date: string;
  currency: string;
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
  videoPlays: number | null;
  video3sViews: number | null;
  thruplays: number | null;
  videoP25: number | null;
  videoP50: number | null;
  videoP75: number | null;
  videoP95: number | null;
  videoP100: number | null;
  videoAvgTimeSec: number | null;
  postEngagement: number | null;
  postReactions: number | null;
  postComments: number | null;
  postShares: number | null;
  postSaves: number | null;
  objective: string | null;
  optimizationGoal: string | null;
  attributionSetting: string | null;
  actionsRaw: ActionStat[] | null;
  actionValuesRaw: ActionStat[] | null;
}

export function parseInsightRow(row: RawInsightRow, fallbackCurrency: string): ParsedInsight {
  const actions = row.actions;
  const values = row.action_values;
  // A row exists only when the ad delivered that day. Meta omits zero-count action types,
  // so a missing conversion action on an existing row is a true zero.
  const conv = (types: readonly string[]) => pickAction(actions, types) ?? 0;
  const convValue = (types: readonly string[]) => pickAction(values, types) ?? 0;
  return {
    metaAdId: row.ad_id,
    metaAdSetId: row.adset_id,
    metaCampaignId: row.campaign_id,
    adName: row.ad_name ?? null,
    adSetName: row.adset_name ?? null,
    campaignName: row.campaign_name ?? null,
    date: row.date_start,
    currency: row.account_currency ?? fallbackCurrency,
    spend: num(row.spend) ?? 0,
    impressions: num(row.impressions) ?? 0,
    reach: num(row.reach),
    clicks: num(row.clicks),
    linkClicks: num(row.inline_link_clicks) ?? (actions ? pickAction(actions, ["link_click"]) ?? 0 : null),
    outboundClicks: row.outbound_clicks ? pickAction(row.outbound_clicks, ["outbound_click"]) ?? 0 : actions ? 0 : null,
    landingPageViews: conv(ACTION_PRECEDENCE.landingPageViews),
    purchases: conv(ACTION_PRECEDENCE.purchases),
    purchaseValue: convValue(ACTION_PRECEDENCE.purchases),
    websitePurchases: conv(ACTION_PRECEDENCE.websitePurchases),
    websitePurchaseValue: convValue(ACTION_PRECEDENCE.websitePurchases),
    addToCart: conv(ACTION_PRECEDENCE.addToCart),
    initiateCheckout: conv(ACTION_PRECEDENCE.initiateCheckout),
    viewContent: conv(ACTION_PRECEDENCE.viewContent),
    leads: conv(ACTION_PRECEDENCE.leads),
    completeRegistration: conv(ACTION_PRECEDENCE.completeRegistration),
    // Video fields are absent for non-video ads: keep null (not applicable), not 0.
    videoPlays: sumList(row.video_play_actions),
    video3sViews: row.video_play_actions || row.video_thruplay_watched_actions ? conv(ACTION_PRECEDENCE.video3sViews) : pickAction(actions, ACTION_PRECEDENCE.video3sViews),
    thruplays: sumList(row.video_thruplay_watched_actions),
    videoP25: sumList(row.video_p25_watched_actions),
    videoP50: sumList(row.video_p50_watched_actions),
    videoP75: sumList(row.video_p75_watched_actions),
    videoP95: sumList(row.video_p95_watched_actions),
    videoP100: sumList(row.video_p100_watched_actions),
    videoAvgTimeSec: row.video_avg_time_watched_actions ? sumList(row.video_avg_time_watched_actions) : null,
    postEngagement: conv(ACTION_PRECEDENCE.postEngagement),
    postReactions: conv(ACTION_PRECEDENCE.postReactions),
    postComments: conv(ACTION_PRECEDENCE.postComments),
    postShares: conv(ACTION_PRECEDENCE.postShares),
    postSaves: conv(ACTION_PRECEDENCE.postSaves),
    objective: row.objective ?? null,
    optimizationGoal: row.optimization_goal ?? null,
    attributionSetting: row.attribution_setting ?? null,
    actionsRaw: actions ?? null,
    actionValuesRaw: values ?? null,
  };
}

/** Stable hash of the metric values, used to detect attribution revisions. */
export function insightHash(p: ParsedInsight & { results?: number | null; resultType?: string | null }): string {
  const exclude = new Set(["actionsRaw", "actionValuesRaw", "adName", "adSetName", "campaignName"]);
  const values = Object.fromEntries(Object.entries(p).filter(([k]) => !exclude.has(k)));
  const keys = Object.keys(values).sort();
  return createHash("sha256").update(JSON.stringify(keys.map((k) => [k, (values as Record<string, unknown>)[k]]))).digest("hex");
}

export function parseBudget(v: string | undefined | null, currency: string): number | null {
  const n = num(v);
  return n === null ? null : n / currencyOffset(currency);
}

export function parseMetaTime(v: string | undefined | null): Date | null {
  if (!v) return null;
  // Meta returns e.g. "2024-03-01T10:00:00+0530"; normalise the offset for Date.
  const iso = v.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type CreativeKind = "VIDEO" | "IMAGE" | "CAROUSEL" | "OTHER" | "UNKNOWN";

export interface RawCreative {
  id: string;
  name?: string;
  title?: string;
  body?: string;
  object_type?: string;
  thumbnail_url?: string;
  image_url?: string;
  video_id?: string;
  effective_object_story_id?: string;
  instagram_permalink_url?: string;
  object_story_spec?: {
    video_data?: { video_id?: string };
    link_data?: { child_attachments?: unknown[]; picture?: string; image_hash?: string };
    photo_data?: unknown;
    template_data?: unknown;
  };
  asset_feed_spec?: { videos?: unknown[]; images?: unknown[] };
}

export function creativeKind(c: RawCreative): CreativeKind {
  const s = c.object_story_spec;
  if (s?.link_data?.child_attachments?.length) return "CAROUSEL";
  if (c.video_id || s?.video_data?.video_id || c.object_type === "VIDEO" || c.asset_feed_spec?.videos?.length) return "VIDEO";
  if (c.image_url || s?.photo_data || s?.link_data?.picture || s?.link_data?.image_hash || c.object_type === "PHOTO" || c.asset_feed_spec?.images?.length) return "IMAGE";
  if (c.object_type) return "OTHER";
  return "UNKNOWN";
}
