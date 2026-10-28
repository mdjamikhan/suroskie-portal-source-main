// Report service: the only entry point pages, API routes and exports use for performance data.
// Each function takes the viewer's AccessContext, enforces the permission, clamps the date
// range, runs scoped SQL, computes metrics and projects them to the viewer's allowed metrics.
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings, type AppSettings } from "@/lib/settings";
import {
  assertCreatorAccess, intersectScope, requirePermission, type AccessContext,
} from "@/lib/access/context";
import { computeMetrics, projectMetrics, emptyTotals, type MetricMap, type Totals } from "@/lib/metrics/compute";
import { METRIC_BY_KEY } from "@/lib/metrics/catalog";
import { NotFoundError } from "@/lib/errors";
import { clampRange, previousPeriod, diffDays, type ClampResult, type DateRange } from "./date-range";
import { parseReportQuery, type ReportFilters, type ReportQuery } from "./filters";
import {
  queryBreakdown, queryGrouped, queryTimeseries, queryTotals, SORTABLE_METRICS,
  type GroupRow, type ScopeOptions,
} from "./queries";

export type SearchParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

export function demoMode(): boolean {
  return env().DEMO_MODE;
}

export interface ReportContext {
  ctx: AccessContext;
  query: ReportQuery;
  filters: ReportFilters;
  clamp: ClampResult;
  settings: AppSettings;
  demo: boolean;
  unsupported: Set<string>;
  currency: string;
  /** Distinct ad-account time zones in scope (Meta reports days in the account's time zone). */
  accountTimezones: string[];
  attributionSettings: string[];
}

/** Parse + clamp + resolve shared report context. */
export async function prepareReport(ctx: AccessContext, sp: SearchParamsInput): Promise<ReportContext> {
  const settings = await getSettings();
  const query = parseReportQuery(sp, settings.reportingTimezone);
  const clamp = clampRange(query.filters.range, ctx, settings.reportingTimezone);
  const filters: ReportFilters = { ...query.filters, range: clamp.range };
  const demo = demoMode();
  const accounts = intersectScope(ctx.adAccounts, filters.adAccountIds);
  const [unsupportedRows, accountRows] = await Promise.all([
    prisma.metricDefinition.findMany({ where: { isSupported: false }, select: { key: true } }),
    prisma.adAccount.findMany({
      where: { isDemo: demo, ...(accounts === "ALL" ? {} : { id: { in: accounts } }) },
      select: { currency: true, timezoneName: true },
    }),
  ]);
  const currencies = [...new Set(accountRows.map((a) => a.currency))];
  return {
    ctx, query, filters, clamp, settings, demo,
    unsupported: new Set(unsupportedRows.map((r) => r.key)),
    currency: currencies.length === 1 ? currencies[0] : "INR",
    accountTimezones: [...new Set(accountRows.map((a) => a.timezoneName))],
    attributionSettings: [],
  };
}

function scopeOpts(r: ReportContext, range?: { from: string; to: string }): ScopeOptions {
  return { demo: r.demo, range };
}

export function metricsFor(r: ReportContext, t: Totals): MetricMap {
  return projectMetrics(computeMetrics(t, { unsupported: r.unsupported }), r.ctx.metrics);
}

/** Pick a sort metric the viewer is allowed to see; never sort by a hidden metric. */
export function allowedSort(r: ReportContext, requested: string | undefined, fallbacks: string[]): string {
  const candidates = [requested, ...fallbacks, "impressions"].filter(Boolean) as string[];
  for (const c of candidates) if (r.ctx.metrics.has(c) && SORTABLE_METRICS.includes(c)) return c;
  // No sortable visible metric at all: sort by something neutral (impressions) without exposing it.
  return "impressions";
}

export interface SampleFlag {
  low: boolean;
  reasons: string[];
}

export function sampleFlag(t: Totals, s: AppSettings): SampleFlag {
  const reasons: string[] = [];
  if (t.spend < s.minSpendForRanking) reasons.push("spend below the minimum threshold");
  if ((t.purchases ?? 0) < s.minPurchasesForRanking) reasons.push(`fewer than ${s.minPurchasesForRanking} purchases`);
  if (t.impressions < s.minImpressionsForRanking) reasons.push(`fewer than ${s.minImpressionsForRanking.toLocaleString("en-IN")} impressions`);
  return { low: reasons.length > 0, reasons };
}

export interface RangeMeta {
  from: string;
  to: string;
  preset: DateRange["preset"];
  clamped: boolean;
  empty: boolean;
  earliestAllowed: string | null;
  reportingTimezone: string;
  accountTimezones: string[];
  currency: string;
  demo: boolean;
}

function rangeMeta(r: ReportContext): RangeMeta {
  return {
    from: r.filters.range.from, to: r.filters.range.to, preset: r.query.filters.range.preset,
    clamped: r.clamp.clamped, empty: r.clamp.empty, earliestAllowed: r.clamp.earliestAllowed,
    reportingTimezone: r.settings.reportingTimezone, accountTimezones: r.accountTimezones,
    currency: r.currency, demo: r.demo,
  };
}

async function totalsOrEmpty(r: ReportContext, f: ReportFilters, range?: { from: string; to: string }) {
  if (r.clamp.empty) return emptyTotals();
  return queryTotals(r.ctx, f, scopeOpts(r, range));
}

async function grouped(r: ReportContext, f: ReportFilters, o: Omit<Parameters<typeof queryGrouped>[2], "demo">) {
  if (r.clamp.empty) return { rows: [] as GroupRow[], total: 0 };
  return queryGrouped(r.ctx, f, { ...o, demo: r.demo });
}

async function series(r: ReportContext, f: ReportFilters) {
  if (r.clamp.empty) return [];
  const days = diffDays(f.range.from, f.range.to) + 1;
  const grain = days > 120 ? "week" : "day";
  const pts = await queryTimeseries(r.ctx, f, { demo: r.demo, grain });
  return pts.map((p) => ({ date: p.date, grain, metrics: metricsFor(r, p.totals) }));
}

// ───────────────────────── entity metadata (scoped) ─────────────────────────

export async function adMeta(adIds: string[]) {
  if (!adIds.length) return new Map();
  const ads = await prisma.ad.findMany({
    where: { id: { in: adIds } },
    select: {
      id: true, metaAdId: true, name: true, status: true, effectiveStatus: true, previewShareableLink: true, metaCreatedTime: true,
      campaign: { select: { id: true, name: true, objective: true } },
      adSet: { select: { id: true, name: true, optimizationGoal: true, attributionSpec: true } },
      adAccount: { select: { id: true, name: true } },
      creative: { select: { thumbnailUrl: true, creativeType: true, metaCreativeId: true } },
      mapping: { select: { creator: { select: { id: true, name: true, code: true } }, creativeAsset: { select: { id: true, title: true, product: true, contentAngle: true, hook: true, creativeType: true, launchDate: true } } } },
    },
  });
  return new Map(ads.map((a) => [a.id, a]));
}

export type AdMeta = Awaited<ReturnType<typeof adMeta>> extends Map<string, infer V> ? V : never;

export function describeAttribution(spec: unknown): string | null {
  if (!Array.isArray(spec)) return null;
  const parts = spec
    .map((s: { event_type?: string; window_days?: number }) =>
      s?.event_type && s?.window_days ? `${s.window_days}-day ${s.event_type === "CLICK_THROUGH" ? "click" : s.event_type === "VIEW_THROUGH" ? "view" : s.event_type.toLowerCase().replace(/_/g, " ")}` : null,
    )
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function adRowView(r: ReportContext, row: GroupRow, meta: AdMeta | undefined) {
  return {
    id: row.key!,
    metaAdId: meta?.metaAdId ?? null,
    name: meta?.name ?? "Unknown ad",
    status: meta?.effectiveStatus ?? meta?.status ?? null,
    thumbnailUrl: meta?.creative?.thumbnailUrl ?? null,
    previewUrl: meta?.previewShareableLink ?? null,
    creativeType: meta?.mapping?.creativeAsset?.creativeType && meta.mapping.creativeAsset.creativeType !== "UNKNOWN"
      ? meta.mapping.creativeAsset.creativeType
      : meta?.creative?.creativeType ?? "UNKNOWN",
    creator: meta?.mapping?.creator ?? null,
    asset: meta?.mapping?.creativeAsset
      ? { id: meta.mapping.creativeAsset.id, title: meta.mapping.creativeAsset.title, product: meta.mapping.creativeAsset.product, angle: meta.mapping.creativeAsset.contentAngle, hook: meta.mapping.creativeAsset.hook }
      : null,
    campaign: meta?.campaign ? { id: meta.campaign.id, name: meta.campaign.name, objective: meta.campaign.objective } : null,
    adSet: meta?.adSet ? { id: meta.adSet.id, name: meta.adSet.name, optimizationGoal: meta.adSet.optimizationGoal, attribution: describeAttribution(meta.adSet.attributionSpec) } : null,
    account: meta?.adAccount ?? null,
    metrics: metricsFor(r, row.totals),
    sample: sampleFlag(row.totals, r.settings),
  };
}

export type AdRowView = ReturnType<typeof adRowView>;

export async function adRows(r: ReportContext, rows: GroupRow[]): Promise<AdRowView[]> {
  const meta = await adMeta(rows.map((x) => x.key!).filter(Boolean));
  return rows.map((row) => adRowView(r, row, meta.get(row.key!)));
}

async function creatorRows(r: ReportContext, rows: GroupRow[]) {
  const ids = rows.map((x) => x.key).filter((k): k is string => Boolean(k));
  const creators = await prisma.creator.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, code: true, instagramHandle: true, profileImageUrl: true, isActive: true },
  });
  const byId = new Map(creators.map((c) => [c.id, c]));
  return rows.map((row) => ({
    id: row.key,
    creator: row.key ? byId.get(row.key) ?? null : null,
    adCount: row.totals.adCount,
    metrics: metricsFor(r, row.totals),
    sample: sampleFlag(row.totals, r.settings),
  }));
}

// ───────────────────────── Overview ─────────────────────────

export async function getOverview(ctx: AccessContext, sp: SearchParamsInput) {
  requirePermission(ctx, "reports.overview");
  const r = await prepareReport(ctx, sp);
  const f = r.filters;
  const prev = previousPeriod(f.range);
  const s = r.settings;

  const rankMetric = allowedSort(r, r.query.sort, ["purchase_value", "purchases", "roas"]);
  const bestMetric = allowedSort(r, undefined, ["roas", "purchases", "ctr"]);
  const weakMetric = allowedSort(r, undefined, ["roas", "ctr", "hook_rate"]);
  const weakDir = METRIC_BY_KEY[weakMetric]?.higherIsBetter === false ? "desc" : "asc";
  const bestDir = METRIC_BY_KEY[bestMetric]?.higherIsBetter === false ? "asc" : "desc";

  const [current, previous, timeseries, creatorsRanked, best, weak, counts, sync] = await Promise.all([
    totalsOrEmpty(r, f),
    r.query.compare ? totalsOrEmpty(r, f, prev) : Promise.resolve(null),
    series(r, f),
    grouped(r, f, { dimension: "creator", sort: rankMetric, dir: "desc", limit: 10, offset: 0 }),
    grouped(r, f, { dimension: "ad", sort: bestMetric, dir: bestDir, limit: 5, offset: 0, minSpend: s.minSpendForRanking, minPurchases: s.minPurchasesForRanking }),
    grouped(r, f, { dimension: "ad", sort: weakMetric, dir: weakDir, limit: 5, offset: 0, minSpend: s.minSpendForRanking }),
    entityCounts(r),
    syncStatus(ctx),
  ]);

  return {
    range: rangeMeta(r),
    previousRange: r.query.compare ? prev : null,
    metrics: metricsFor(r, current),
    previousMetrics: previous ? metricsFor(r, previous) : null,
    timeseries,
    creatorRanking: { metric: rankMetric, rows: await creatorRows(r, creatorsRanked.rows) },
    bestCreatives: { metric: bestMetric, rows: await adRows(r, best.rows) },
    weakCreatives: { metric: weakMetric, rows: await adRows(r, weak.rows) },
    counts,
    sync,
    thresholds: { minSpend: s.minSpendForRanking, minPurchases: s.minPurchasesForRanking, minImpressions: s.minImpressionsForRanking },
  };
}

/** Structure counts within the viewer's scope. Unmapped counts are only meaningful with ALL creator scope. */
async function entityCounts(r: ReportContext) {
  const accounts = intersectScope(r.ctx.adAccounts, r.filters.adAccountIds);
  const accountWhere = { isDemo: r.demo, ...(accounts === "ALL" ? {} : { id: { in: accounts } }) };
  const creators = intersectScope(r.ctx.creators, r.filters.creatorIds);
  const adWhere = {
    adAccount: accountWhere,
    ...(creators === "ALL" ? {} : { mapping: { creatorId: { in: creators } } }),
    ...(r.filters.campaignIds.length ? { campaignId: { in: r.filters.campaignIds } } : {}),
  };
  const [activeCampaigns, activeAdSets, activeAds, totalAds, mappedAds] = await Promise.all([
    prisma.campaign.count({ where: { adAccount: accountWhere, effectiveStatus: "ACTIVE", ...(creators === "ALL" ? {} : { ads: { some: { mapping: { creatorId: { in: creators } } } } }) } }),
    prisma.adSet.count({ where: { adAccount: accountWhere, effectiveStatus: "ACTIVE", ...(creators === "ALL" ? {} : { ads: { some: { mapping: { creatorId: { in: creators } } } } }) } }),
    prisma.ad.count({ where: { ...adWhere, effectiveStatus: "ACTIVE" } }),
    prisma.ad.count({ where: adWhere }),
    prisma.ad.count({ where: { ...adWhere, mapping: creators === "ALL" ? { isNot: null } : { creatorId: { in: creators } } } }),
  ]);
  return {
    activeCampaigns, activeAdSets, activeAds, totalAds, mappedAds,
    unmappedAds: r.ctx.creators === "ALL" ? totalAds - mappedAds : null,
  };
}

// ───────────────────────── Sync status ─────────────────────────

export async function syncStatus(ctx: AccessContext) {
  const demo = demoMode();
  const accounts = await prisma.adAccount.findMany({
    where: { isDemo: demo, syncEnabled: true, ...(ctx.adAccounts === "ALL" ? {} : { id: { in: ctx.adAccounts } }) },
    select: { id: true, name: true, lastSuccessfulSyncAt: true, syncHealth: true, timezoneName: true, currency: true },
    orderBy: { name: "asc" },
  });
  const times = accounts.map((a) => a.lastSuccessfulSyncAt?.getTime()).filter((t): t is number => typeof t === "number");
  const settings = await getSettings();
  const oldest = times.length === accounts.length && times.length ? new Date(Math.min(...times)) : null;
  const stale = !oldest || Date.now() - oldest.getTime() > settings.staleAfterHours * 3_600_000;
  return {
    demo,
    // Only admins need account-level detail; others see the freshness signal.
    accounts: ctx.permissions.has("adaccounts.view") ? accounts : [],
    lastSuccessfulSyncAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    oldestSuccessfulSyncAt: oldest?.toISOString() ?? null,
    stale,
    failing: accounts.some((a) => a.syncHealth === "FAILING"),
    accountCount: accounts.length,
  };
}

// ───────────────────────── Creators ─────────────────────────

export async function listCreators(ctx: AccessContext, sp: SearchParamsInput) {
  requirePermission(ctx, "reports.creators");
  const r = await prepareReport(ctx, sp);
  const { page, pageSize } = r.query;
  const search = r.filters.search?.toLowerCase();
  const where = {
    ...(ctx.creators === "ALL" ? {} : { id: { in: ctx.creators } }),
    ...(search
      ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { code: { contains: search, mode: "insensitive" as const } }, { instagramHandle: { contains: search, mode: "insensitive" as const } }] }
      : {}),
  };
  const [total, creators] = await Promise.all([
    prisma.creator.count({ where }),
    prisma.creator.findMany({
      where, orderBy: [{ isActive: "desc" }, { name: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, name: true, code: true, instagramHandle: true, profileImageUrl: true, isActive: true, team: true, _count: { select: { mappings: true } } },
    }),
  ]);
  const ids = creators.map((c) => c.id);
  const perf = ids.length
    ? await grouped(r, { ...r.filters, search: undefined }, { dimension: "creator", sort: "impressions", dir: "desc", limit: ids.length, offset: 0, onlyIds: ids })
    : { rows: [] };
  const byId = new Map(perf.rows.map((p) => [p.key, p.totals]));
  return {
    range: rangeMeta(r),
    page, pageSize, total,
    rows: creators.map((c) => ({
      ...c,
      mappedAds: c._count.mappings,
      metrics: metricsFor(r, byId.get(c.id) ?? emptyTotals()),
    })),
  };
}

/** Lightweight scoped search for the creator combobox. */
export async function searchCreators(ctx: AccessContext, q: string) {
  requirePermission(ctx, ["reports.creators", "mapping.manage", "creators.manage"]);
  const term = q.trim().slice(0, 80);
  return prisma.creator.findMany({
    where: {
      ...(ctx.creators === "ALL" ? {} : { id: { in: ctx.creators } }),
      ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { code: { contains: term, mode: "insensitive" } }, { instagramHandle: { contains: term, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: 20,
    select: { id: true, name: true, code: true, instagramHandle: true, profileImageUrl: true, isActive: true },
  });
}

export async function getCreatorPerformance(ctx: AccessContext, creatorId: string, sp: SearchParamsInput) {
  requirePermission(ctx, "reports.creators");
  assertCreatorAccess(ctx, creatorId);
  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: {
      id: true, code: true, name: true, instagramHandle: true, profileImageUrl: true, notes: true, isActive: true, team: true, ownerUserId: true,
      owner: { select: { name: true } },
      assets: { select: { id: true, title: true, creativeType: true, product: true, contentAngle: true, hook: true, launchDate: true, tags: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!creator) throw new NotFoundError("Creator not found or not accessible");

  const r = await prepareReport(ctx, sp);
  // Force the creator filter regardless of any creator ids in the query string.
  const f: ReportFilters = { ...r.filters, creatorIds: [creatorId] };
  const prev = previousPeriod(f.range);
  const sort = allowedSort(r, r.query.sort, ["purchase_value", "purchases", "impressions"]);
  const dir = r.query.dir ?? (METRIC_BY_KEY[sort]?.higherIsBetter === false ? "asc" : "desc");
  const { page, pageSize } = r.query;
  const s = r.settings;
  const bestMetric = allowedSort(r, undefined, ["roas", "purchases", "ctr"]);
  const lowDir = METRIC_BY_KEY[bestMetric]?.higherIsBetter === false ? "desc" : "asc";

  const [current, previous, timeseries, table, best, lowest] = await Promise.all([
    totalsOrEmpty(r, f),
    totalsOrEmpty(r, f, prev),
    series(r, f),
    grouped(r, f, { dimension: "ad", sort, dir, limit: pageSize, offset: (page - 1) * pageSize }),
    grouped(r, f, { dimension: "ad", sort: bestMetric, dir: lowDir === "asc" ? "desc" : "asc", limit: 3, offset: 0, minSpend: s.minSpendForRanking }),
    grouped(r, f, { dimension: "ad", sort: bestMetric, dir: lowDir, limit: 3, offset: 0, minSpend: s.minSpendForRanking }),
  ]);

  // Hide notes from read-only viewers; they are internal.
  const showInternal = ctx.permissions.has("creators.manage");
  return {
    creator: { ...creator, notes: showInternal ? creator.notes : null, owner: showInternal ? creator.owner : null, ownerUserId: showInternal ? creator.ownerUserId : null },
    range: rangeMeta(r),
    previousRange: prev,
    metrics: metricsFor(r, current),
    previousMetrics: metricsFor(r, previous),
    sample: sampleFlag(current, s),
    timeseries,
    creatives: { sort, dir, page, pageSize, total: table.total, rows: await adRows(r, table.rows) },
    best: { metric: bestMetric, rows: await adRows(r, best.rows) },
    lowest: { metric: bestMetric, rows: await adRows(r, lowest.rows) },
  };
}

// ───────────────────────── Creatives & leaderboard ─────────────────────────

export const LEADERBOARD_CRITERIA = [
  { key: "purchase_value", label: "Highest purchase conversion value" },
  { key: "purchases", label: "Highest purchases" },
  { key: "roas", label: "Highest ROAS" },
  { key: "cost_per_purchase", label: "Lowest cost per purchase" },
  { key: "outbound_ctr", label: "Highest outbound CTR" },
  { key: "thruplay_rate", label: "Highest video engagement (ThruPlay rate)" },
  { key: "hook_rate", label: "Highest hook rate (3-second plays ÷ impressions)" },
] as const;

export async function getCreatives(ctx: AccessContext, sp: SearchParamsInput, dimension: "ad" | "creator" = "ad") {
  requirePermission(ctx, "reports.creatives");
  const r = await prepareReport(ctx, sp);
  const sort = allowedSort(r, r.query.sort, ["purchase_value", "purchases", "roas", "impressions"]);
  const dir = r.query.dir ?? (METRIC_BY_KEY[sort]?.higherIsBetter === false ? "asc" : "desc");
  const minSpend = r.query.minSpend ?? r.settings.minSpendForRanking;
  const minPurchases = r.query.minPurchases ?? (["roas", "cost_per_purchase"].includes(sort) ? r.settings.minPurchasesForRanking : 0);
  const { page, pageSize } = r.query;
  const res = await grouped(r, r.filters, {
    dimension, sort, dir, limit: pageSize, offset: (page - 1) * pageSize,
    minSpend: minSpend || undefined, minPurchases: minPurchases || undefined,
  });
  return {
    range: rangeMeta(r),
    sort, dir, page, pageSize, total: res.total,
    thresholds: { minSpend, minPurchases },
    criteria: LEADERBOARD_CRITERIA.filter((c) => ctx.metrics.has(c.key)),
    rows: dimension === "ad" ? await adRows(r, res.rows) : await creatorRows(r, res.rows),
  };
}

/** Side-by-side comparison of up to 6 ads or creators within the viewer's scope. */
export async function compareEntities(ctx: AccessContext, sp: SearchParamsInput, kind: "ad" | "creator", ids: string[]) {
  requirePermission(ctx, kind === "ad" ? "reports.creatives" : "reports.creators");
  const r = await prepareReport(ctx, sp);
  const requested = [...new Set(ids)].slice(0, 6);
  const allowedIds = kind === "creator" ? (intersectScope(ctx.creators, requested) as string[]) : requested;
  // For ads, scopeWhere() drops anything outside the viewer's account/creator scope.
  const res = await grouped(r, r.filters, { dimension: kind, sort: "impressions", dir: "desc", limit: 6, offset: 0, onlyIds: allowedIds });
  const rows = kind === "ad" ? await adRows(r, res.rows) : await creatorRows(r, res.rows);
  return { range: rangeMeta(r), kind, rows };
}

// ───────────────────────── Campaigns ─────────────────────────

export async function getCampaignReport(ctx: AccessContext, sp: SearchParamsInput, level: "campaign" | "adset" | "ad") {
  requirePermission(ctx, "reports.campaigns");
  const r = await prepareReport(ctx, sp);
  const sort = allowedSort(r, r.query.sort, ["spend", "purchases", "impressions"]);
  const dir = r.query.dir ?? (METRIC_BY_KEY[sort]?.higherIsBetter === false ? "asc" : "desc");
  const { page, pageSize } = r.query;
  const res = await grouped(r, r.filters, { dimension: level === "adset" ? "adset" : level, sort, dir, limit: pageSize, offset: (page - 1) * pageSize });
  const ids = res.rows.map((x) => x.key!).filter(Boolean);

  let rows: unknown[];
  if (level === "campaign") {
    const meta = new Map((await prisma.campaign.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, objective: true, status: true, effectiveStatus: true, dailyBudget: true, lifetimeBudget: true, adAccount: { select: { name: true, currency: true } } },
    })).map((c) => [c.id, c]));
    const showBudget = ctx.metrics.has("spend");
    rows = res.rows.map((row) => {
      const c = meta.get(row.key!);
      return {
        id: row.key, name: c?.name ?? "Unknown", objective: c?.objective ?? null, status: c?.effectiveStatus ?? c?.status ?? null,
        account: c?.adAccount.name ?? null,
        // Budget is treated as sensitive alongside spend.
        dailyBudget: showBudget && c?.dailyBudget ? Number(c.dailyBudget) : null,
        lifetimeBudget: showBudget && c?.lifetimeBudget ? Number(c.lifetimeBudget) : null,
        metrics: metricsFor(r, row.totals),
      };
    });
  } else if (level === "adset") {
    const meta = new Map((await prisma.adSet.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, status: true, effectiveStatus: true, optimizationGoal: true, attributionSpec: true, campaign: { select: { name: true } } },
    })).map((c) => [c.id, c]));
    rows = res.rows.map((row) => {
      const a = meta.get(row.key!);
      return {
        id: row.key, name: a?.name ?? "Unknown", status: a?.effectiveStatus ?? a?.status ?? null, campaign: a?.campaign.name ?? null,
        optimizationGoal: a?.optimizationGoal ?? null, attribution: describeAttribution(a?.attributionSpec),
        metrics: metricsFor(r, row.totals),
      };
    });
  } else {
    rows = await adRows(r, res.rows);
  }
  return { range: rangeMeta(r), level, sort, dir, page, pageSize, total: res.total, rows };
}

// ───────────────────────── Breakdowns ─────────────────────────

export const BREAKDOWN_TYPES = {
  AGE_GENDER: { label: "Age & gender", dims: ["Age", "Gender"] },
  PLATFORM_POSITION: { label: "Placement", dims: ["Platform", "Position"] },
  DEVICE_PLATFORM: { label: "Device", dims: ["Device"] },
  COUNTRY: { label: "Country", dims: ["Country"] },
  REGION: { label: "Region", dims: ["Region"] },
} as const;
export type BreakdownKey = keyof typeof BREAKDOWN_TYPES;

export async function getBreakdown(ctx: AccessContext, sp: SearchParamsInput, type: BreakdownKey) {
  requirePermission(ctx, "reports.breakdowns");
  const r = await prepareReport(ctx, sp);
  const rows = r.clamp.empty ? [] : await queryBreakdown(ctx, r.filters, type, { demo: r.demo });
  return {
    range: rangeMeta(r),
    type,
    rows: rows.map((b) => {
      const t: Totals = {
        ...emptyTotals(), rowCount: 1, adCount: 2, dayCount: 2, currencies: b.currencies,
        spend: b.spend, impressions: b.impressions, reach: b.reach, clicks: b.clicks, linkClicks: b.linkClicks,
        purchases: b.purchases, purchaseValue: b.purchaseValue,
      };
      const all = metricsFor(r, t);
      const keep = ["spend", "impressions", "reach", "clicks", "link_clicks", "ctr", "cpm", "cpc", "purchases", "purchase_value", "roas", "cost_per_purchase"];
      return { dim1: b.dim1, dim2: b.dim2, metrics: Object.fromEntries(keep.filter((k) => k in all).map((k) => [k, all[k]])) };
    }),
  };
}
