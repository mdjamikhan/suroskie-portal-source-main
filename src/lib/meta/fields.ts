// Graph API fields requested by the sync engine. Only documented Marketing API fields are used.
// If Meta rejects a field (e.g. after an API version change), the sync engine drops it, retries,
// and marks dependent metrics "unsupported" instead of failing the whole sync.

export const AD_ACCOUNT_FIELDS = ["id", "account_id", "name", "currency", "timezone_name", "account_status", "business{id,name}"];

export const CAMPAIGN_FIELDS = [
  "id", "name", "objective", "status", "effective_status", "buying_type", "daily_budget", "lifetime_budget",
  "start_time", "stop_time", "created_time", "updated_time",
];

export const ADSET_FIELDS = [
  "id", "name", "campaign_id", "status", "effective_status", "optimization_goal", "billing_event", "bid_strategy",
  "daily_budget", "lifetime_budget", "attribution_spec", "promoted_object", "destination_type", "start_time", "end_time",
  "created_time", "updated_time",
];

export const AD_FIELDS = [
  "id", "name", "adset_id", "campaign_id", "status", "effective_status", "creative{id}", "preview_shareable_link",
  "created_time", "updated_time",
];

export const CREATIVE_FIELDS = [
  "id", "name", "title", "body", "object_type", "thumbnail_url", "image_url", "video_id", "effective_object_story_id",
  "instagram_permalink_url", "object_story_spec", "asset_feed_spec",
];

export const INSIGHT_FIELDS = [
  "account_id", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name", "date_start", "date_stop",
  "account_currency", "spend", "impressions", "reach", "clicks", "inline_link_clicks", "outbound_clicks",
  "actions", "action_values", "video_play_actions", "video_thruplay_watched_actions", "video_p25_watched_actions",
  "video_p50_watched_actions", "video_p75_watched_actions", "video_p95_watched_actions", "video_p100_watched_actions",
  "video_avg_time_watched_actions", "objective", "optimization_goal", "attribution_setting",
];

export const BREAKDOWN_INSIGHT_FIELDS = [
  "ad_id", "adset_id", "campaign_id", "date_start", "account_currency", "spend", "impressions", "reach", "clicks", "inline_link_clicks", "actions", "action_values",
];

/** Meta breakdown parameter for each stored breakdown type. */
export const BREAKDOWN_PARAMS = {
  AGE_GENDER: ["age", "gender"],
  PLATFORM_POSITION: ["publisher_platform", "platform_position"],
  DEVICE_PLATFORM: ["device_platform"],
  COUNTRY: ["country"],
  REGION: ["region"],
} as const;

/** Map Graph API source fields → metric keys that depend on them (for "unsupported" marking). */
export const FIELD_TO_METRICS: Record<string, string[]> = {
  reach: ["reach", "frequency"],
  clicks: ["clicks", "ctr_all", "cpc_all"],
  inline_link_clicks: ["link_clicks", "ctr", "cpc"],
  outbound_clicks: ["outbound_clicks", "outbound_ctr", "cost_per_outbound_click"],
  video_play_actions: ["video_plays"],
  video_thruplay_watched_actions: ["thruplays", "thruplay_rate", "cost_per_thruplay"],
  video_p25_watched_actions: ["video_p25"],
  video_p50_watched_actions: ["video_p50"],
  video_p75_watched_actions: ["video_p75"],
  video_p95_watched_actions: ["video_p95"],
  video_p100_watched_actions: ["video_p100"],
  video_avg_time_watched_actions: ["video_avg_time"],
};

/**
 * Currencies whose Graph API budget amounts have no minor unit (offset 1). All others use 100.
 * Budgets (daily_budget, lifetime_budget) are returned in the currency's minor unit; insights
 * `spend` is returned in major units.
 */
const ZERO_DECIMAL = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);
export function currencyOffset(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}
