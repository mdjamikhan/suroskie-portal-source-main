// Scoped aggregation queries over ad_insight_daily. All SQL is parameterised (Prisma.sql).
// Access control lives here, in the WHERE clause — not in the UI:
//   * demo vs real data separation (never mixed)
//   * ad-account scope and creator scope from the AccessContext
//   * request filters are intersected with scope, so ids outside scope match nothing
//   * the date window has already been clamped to the user's authorised range
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { intersectScope, type AccessContext, type Scope } from "@/lib/access/context";
import { emptyTotals, type Totals } from "@/lib/metrics/compute";
import type { ReportFilters } from "./filters";

const sql = Prisma.sql;

/** Clause for "column is in scope". An empty scope list matches nothing (FALSE), never everything. */
function scopeClause(column: Prisma.Sql, scope: Scope): Prisma.Sql {
  if (scope === "ALL") return Prisma.empty;
  if (scope.length === 0) return sql` AND FALSE`;
  return sql` AND ${column} = ANY(${scope}::text[])`;
}

export const BASE_FROM = sql`
  FROM ad_insight_daily i
  JOIN ad a ON a.id = i."adId"
  JOIN ad_account acc ON acc.id = i."adAccountId"
  LEFT JOIN ad_creator_mapping m ON m."adId" = i."adId"
  LEFT JOIN creative_asset ca ON ca.id = m."creativeAssetId"
  LEFT JOIN ad_creative cr ON cr.id = a."creativeId"`;

const EFFECTIVE_TYPE = sql`(CASE WHEN ca."creativeType" IS NOT NULL AND ca."creativeType"::text <> 'UNKNOWN' THEN ca."creativeType"::text ELSE COALESCE(cr."creativeType"::text, 'UNKNOWN') END)`;

export interface ScopeOptions {
  demo: boolean;
  /** Override the date window (e.g. for the comparison period). */
  range?: { from: string; to: string };
  /** Restrict to mapped ads only, regardless of creator scope. */
  mappedOnly?: boolean;
}

export function scopeWhere(ctx: AccessContext, f: ReportFilters, opts: ScopeOptions): Prisma.Sql {
  const from = opts.range?.from ?? f.range.from;
  const to = opts.range?.to ?? f.range.to;
  const accounts = intersectScope(ctx.adAccounts, f.adAccountIds);
  const creators = intersectScope(ctx.creators, f.creatorIds);
  const parts: Prisma.Sql[] = [
    sql`WHERE i.date >= ${from}::date AND i.date <= ${to}::date AND acc."isDemo" = ${opts.demo}`,
    scopeClause(sql`i."adAccountId"`, accounts),
    scopeClause(sql`m."creatorId"`, creators),
  ];
  if (opts.mappedOnly) parts.push(sql` AND m."creatorId" IS NOT NULL`);
  if (f.campaignIds.length) parts.push(sql` AND i."campaignId" = ANY(${f.campaignIds}::text[])`);
  if (f.products.length) parts.push(sql` AND ca.product = ANY(${f.products}::text[])`);
  if (f.creativeTypes.length) parts.push(sql` AND ${EFFECTIVE_TYPE} = ANY(${f.creativeTypes}::text[])`);
  if (f.search) parts.push(sql` AND (lower(a.name) LIKE ${"%" + escapeLike(f.search.toLowerCase()) + "%"} ESCAPE '\\')`);
  return Prisma.join(parts, "");
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const TOTALS_SELECT = sql`
  COUNT(*)::int AS "rowCount",
  COUNT(DISTINCT i."adId")::int AS "adCount",
  COUNT(DISTINCT i.date)::int AS "dayCount",
  COALESCE(array_agg(DISTINCT i.currency), '{}') AS currencies,
  COALESCE(SUM(i.spend), 0)::float8 AS spend,
  COALESCE(SUM(i.impressions), 0)::float8 AS impressions,
  SUM(i.reach)::float8 AS reach,
  SUM(i.clicks)::float8 AS clicks,
  SUM(i."linkClicks")::float8 AS "linkClicks",
  SUM(i."outboundClicks")::float8 AS "outboundClicks",
  SUM(i."landingPageViews")::float8 AS "landingPageViews",
  SUM(i.purchases)::float8 AS purchases,
  SUM(i."purchaseValue")::float8 AS "purchaseValue",
  SUM(i."websitePurchases")::float8 AS "websitePurchases",
  SUM(i."websitePurchaseValue")::float8 AS "websitePurchaseValue",
  SUM(i."addToCart")::float8 AS "addToCart",
  SUM(i."initiateCheckout")::float8 AS "initiateCheckout",
  SUM(i."viewContent")::float8 AS "viewContent",
  SUM(i.leads)::float8 AS leads,
  SUM(i."completeRegistration")::float8 AS "completeRegistration",
  SUM(i.results)::float8 AS results,
  COALESCE(array_remove(array_agg(DISTINCT i."resultType"), NULL), '{}') AS "resultTypes",
  SUM(i."videoPlays")::float8 AS "videoPlays",
  SUM(i."video3sViews")::float8 AS "video3sViews",
  SUM(i.thruplays)::float8 AS thruplays,
  SUM(i."videoP25")::float8 AS "videoP25",
  SUM(i."videoP50")::float8 AS "videoP50",
  SUM(i."videoP75")::float8 AS "videoP75",
  SUM(i."videoP95")::float8 AS "videoP95",
  SUM(i."videoP100")::float8 AS "videoP100",
  SUM(i."videoAvgTimeSec" * COALESCE(i."videoPlays", 0))::float8 AS "videoAvgTimeWeighted",
  SUM(CASE WHEN i."videoAvgTimeSec" IS NOT NULL THEN COALESCE(i."videoPlays", 0) END)::float8 AS "videoAvgTimeWeight",
  SUM(i."postEngagement")::float8 AS "postEngagement",
  SUM(i."postReactions")::float8 AS "postReactions",
  SUM(i."postComments")::float8 AS "postComments",
  SUM(i."postShares")::float8 AS "postShares",
  SUM(i."postSaves")::float8 AS "postSaves"`;

type TotalsRow = Totals;

function toTotals(row: Partial<TotalsRow> | undefined): Totals {
  if (!row) return emptyTotals();
  return { ...emptyTotals(), ...row } as Totals;
}

export async function queryTotals(ctx: AccessContext, f: ReportFilters, opts: ScopeOptions): Promise<Totals> {
  const rows = await prisma.$queryRaw<TotalsRow[]>(sql`SELECT ${TOTALS_SELECT} ${BASE_FROM} ${scopeWhere(ctx, f, opts)}`);
  return toTotals(rows[0]);
}

export async function queryTimeseries(
  ctx: AccessContext,
  f: ReportFilters,
  opts: ScopeOptions & { grain: "day" | "week" },
): Promise<{ date: string; totals: Totals }[]> {
  const bucket = opts.grain === "week" ? sql`date_trunc('week', i.date)::date` : sql`i.date`;
  const rows = await prisma.$queryRaw<(TotalsRow & { bucket: Date })[]>(
    sql`SELECT ${bucket} AS bucket, ${TOTALS_SELECT} ${BASE_FROM} ${scopeWhere(ctx, f, opts)} GROUP BY 1 ORDER BY 1`,
  );
  return rows.map(({ bucket: b, ...t }) => ({ date: b.toISOString().slice(0, 10), totals: toTotals(t) }));
}

export type GroupDimension = "creator" | "ad" | "campaign" | "adset" | "asset" | "account";

const DIMENSION_COLUMN: Record<GroupDimension, Prisma.Sql> = {
  creator: sql`m."creatorId"`,
  ad: sql`i."adId"`,
  campaign: sql`i."campaignId"`,
  adset: sql`i."adSetId"`,
  asset: sql`m."creativeAssetId"`,
  account: sql`i."adAccountId"`,
};

/** Sortable metrics, as SQL over the aggregated group. Only metrics the viewer may see are accepted. */
const SORT_EXPR: Record<string, Prisma.Sql> = {
  spend: sql`SUM(i.spend)`,
  impressions: sql`SUM(i.impressions)`,
  reach: sql`SUM(i.reach)`,
  link_clicks: sql`SUM(i."linkClicks")`,
  outbound_clicks: sql`SUM(i."outboundClicks")`,
  ctr: sql`SUM(i."linkClicks")::numeric / NULLIF(SUM(i.impressions), 0)`,
  outbound_ctr: sql`SUM(i."outboundClicks")::numeric / NULLIF(SUM(i.impressions), 0)`,
  cpm: sql`SUM(i.spend) / NULLIF(SUM(i.impressions), 0)`,
  cpc: sql`SUM(i.spend) / NULLIF(SUM(i."linkClicks"), 0)`,
  purchases: sql`SUM(i.purchases)`,
  purchase_value: sql`SUM(i."purchaseValue")`,
  roas: sql`SUM(i."purchaseValue") / NULLIF(SUM(i.spend), 0)`,
  cost_per_purchase: sql`SUM(i.spend) / NULLIF(SUM(i.purchases), 0)`,
  add_to_cart: sql`SUM(i."addToCart")`,
  initiate_checkout: sql`SUM(i."initiateCheckout")`,
  leads: sql`SUM(i.leads)`,
  cost_per_lead: sql`SUM(i.spend) / NULLIF(SUM(i.leads), 0)`,
  landing_page_views: sql`SUM(i."landingPageViews")`,
  video_3s_views: sql`SUM(i."video3sViews")`,
  hook_rate: sql`SUM(i."video3sViews") / NULLIF(SUM(i.impressions), 0)`,
  thruplays: sql`SUM(i.thruplays)`,
  thruplay_rate: sql`SUM(i.thruplays) / NULLIF(SUM(i.impressions), 0)`,
  cost_per_thruplay: sql`SUM(i.spend) / NULLIF(SUM(i.thruplays), 0)`,
  post_engagement: sql`SUM(i."postEngagement")`,
};

export { SORTABLE_METRICS } from "@/lib/metrics/sortable";

export interface GroupQueryOptions extends ScopeOptions {
  dimension: GroupDimension;
  sort: string;
  dir: "asc" | "desc";
  limit: number;
  offset: number;
  minSpend?: number;
  minPurchases?: number;
  minImpressions?: number;
  /** Restrict to these dimension ids (already scope-checked by the caller). */
  onlyIds?: string[];
  /** Include rows where the dimension is NULL (e.g. unmapped ads under "creator"). */
  includeNullKey?: boolean;
}

export interface GroupRow {
  key: string | null;
  totals: Totals;
}

export async function queryGrouped(
  ctx: AccessContext,
  f: ReportFilters,
  o: GroupQueryOptions,
): Promise<{ rows: GroupRow[]; total: number }> {
  const col = DIMENSION_COLUMN[o.dimension];
  const sortExpr = SORT_EXPR[o.sort] ?? SORT_EXPR.impressions;
  const dir = o.dir === "asc" ? sql`ASC` : sql`DESC`;
  const having: Prisma.Sql[] = [];
  if (o.minSpend) having.push(sql`SUM(i.spend) >= ${o.minSpend}`);
  if (o.minPurchases) having.push(sql`COALESCE(SUM(i.purchases), 0) >= ${o.minPurchases}`);
  if (o.minImpressions) having.push(sql`SUM(i.impressions) >= ${o.minImpressions}`);
  const havingSql = having.length ? sql`HAVING ${Prisma.join(having, " AND ")}` : Prisma.empty;
  const keyFilter: Prisma.Sql[] = [];
  if (!o.includeNullKey) keyFilter.push(sql` AND ${col} IS NOT NULL`);
  if (o.onlyIds) keyFilter.push(o.onlyIds.length ? sql` AND ${col} = ANY(${o.onlyIds}::text[])` : sql` AND FALSE`);

  const rows = await prisma.$queryRaw<(TotalsRow & { key: string | null; total: number })[]>(sql`
    SELECT ${col} AS key, COUNT(*) OVER()::int AS total, ${TOTALS_SELECT}
    ${BASE_FROM}
    ${scopeWhere(ctx, f, o)} ${Prisma.join(keyFilter, "")}
    GROUP BY ${col}
    ${havingSql}
    ORDER BY ${sortExpr} ${dir} NULLS LAST, ${col} ASC
    LIMIT ${o.limit} OFFSET ${o.offset}`);
  return {
    total: rows[0]?.total ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rows: rows.map(({ key, total, ...t }) => ({ key, totals: toTotals(t) })),
  };
}

/** Per-(group, day) totals, for small multiples and per-entity sparklines. */
export async function queryGroupedTimeseries(
  ctx: AccessContext,
  f: ReportFilters,
  o: ScopeOptions & { dimension: GroupDimension; ids: string[] },
): Promise<{ key: string; date: string; totals: Totals }[]> {
  if (!o.ids.length) return [];
  const col = DIMENSION_COLUMN[o.dimension];
  const rows = await prisma.$queryRaw<(TotalsRow & { key: string; bucket: Date })[]>(sql`
    SELECT ${col} AS key, i.date AS bucket, ${TOTALS_SELECT}
    ${BASE_FROM}
    ${scopeWhere(ctx, f, o)} AND ${col} = ANY(${o.ids}::text[])
    GROUP BY 1, 2 ORDER BY 2`);
  return rows.map(({ key, bucket, ...t }) => ({ key, date: bucket.toISOString().slice(0, 10), totals: toTotals(t) }));
}

export interface BreakdownRow {
  dim1: string;
  dim2: string;
  spend: number;
  impressions: number;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  currencies: string[];
}

export async function queryBreakdown(
  ctx: AccessContext,
  f: ReportFilters,
  breakdownType: string,
  opts: ScopeOptions,
): Promise<BreakdownRow[]> {
  const accounts = intersectScope(ctx.adAccounts, f.adAccountIds);
  const creators = intersectScope(ctx.creators, f.creatorIds);
  const where: Prisma.Sql[] = [
    sql`WHERE b.date >= ${f.range.from}::date AND b.date <= ${f.range.to}::date AND acc."isDemo" = ${opts.demo}`,
    sql` AND b."breakdownType" = ${breakdownType}::"BreakdownType"`,
    scopeClause(sql`b."adAccountId"`, accounts),
    scopeClause(sql`m."creatorId"`, creators),
  ];
  if (f.campaignIds.length) where.push(sql` AND a."campaignId" = ANY(${f.campaignIds}::text[])`);
  if (f.products.length) where.push(sql` AND ca.product = ANY(${f.products}::text[])`);
  return prisma.$queryRaw<BreakdownRow[]>(sql`
    SELECT b.dim1, b.dim2,
      SUM(b.spend)::float8 AS spend, SUM(b.impressions)::float8 AS impressions, SUM(b.reach)::float8 AS reach,
      SUM(b.clicks)::float8 AS clicks, SUM(b."linkClicks")::float8 AS "linkClicks",
      SUM(b.purchases)::float8 AS purchases, SUM(b."purchaseValue")::float8 AS "purchaseValue",
      COALESCE(array_agg(DISTINCT b.currency), '{}') AS currencies
    FROM ad_insight_breakdown_daily b
    JOIN ad a ON a.id = b."adId"
    JOIN ad_account acc ON acc.id = b."adAccountId"
    LEFT JOIN ad_creator_mapping m ON m."adId" = b."adId"
    LEFT JOIN creative_asset ca ON ca.id = m."creativeAssetId"
    ${Prisma.join(where, "")}
    GROUP BY b.dim1, b.dim2
    ORDER BY SUM(b.impressions) DESC
    LIMIT 200`);
}
