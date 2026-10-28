// Idempotent ingestion of daily insights.
//  * keyed on (ad, date): re-running the same window never duplicates rows
//  * unchanged rows are skipped (content hash)
//  * changed rows (attribution updates) bump `revision` and keep the previous values in
//    ad_insight_revision, so history is auditable rather than silently overwritten
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { deriveResult, insightHash, parseInsightRow, pickAction, ACTION_PRECEDENCE, type ParsedInsight, type RawInsightRow } from "@/lib/meta/parse";
import { BREAKDOWN_PARAMS } from "@/lib/meta/fields";
import { ensureAdSetStub, ensureAdStub, ensureCampaignStub } from "./structure";

interface ResolvedIds {
  adId: string;
  adSetId: string;
  campaignId: string;
}

/** Map Meta ids to internal ids, creating stubs for ads Meta no longer lists (e.g. deleted). */
async function resolveIds(adAccountId: string, rows: { metaAdId: string; metaAdSetId: string; metaCampaignId: string; adName?: string | null; adSetName?: string | null; campaignName?: string | null }[]) {
  const metaAdIds = [...new Set(rows.map((r) => r.metaAdId))];
  const ads = await prisma.ad.findMany({ where: { metaAdId: { in: metaAdIds } }, select: { id: true, metaAdId: true, adSetId: true, campaignId: true, adAccountId: true } });
  const map = new Map<string, ResolvedIds>(ads.filter((a) => a.adAccountId === adAccountId).map((a) => [a.metaAdId, { adId: a.id, adSetId: a.adSetId, campaignId: a.campaignId }]));
  let stubs = 0;
  for (const r of rows) {
    if (map.has(r.metaAdId)) continue;
    const campaignId = await ensureCampaignStub(adAccountId, r.metaCampaignId, r.campaignName ?? null);
    const adSetId = await ensureAdSetStub(adAccountId, campaignId, r.metaAdSetId, r.adSetName ?? null);
    const adId = await ensureAdStub(adAccountId, campaignId, adSetId, r.metaAdId, r.adName ?? null);
    map.set(r.metaAdId, { adId, adSetId, campaignId });
    stubs++;
  }
  return { map, stubs };
}

const VALUE_KEYS = [
  "spend", "impressions", "reach", "clicks", "linkClicks", "outboundClicks", "landingPageViews", "purchases", "purchaseValue",
  "websitePurchases", "websitePurchaseValue", "addToCart", "initiateCheckout", "viewContent", "leads", "completeRegistration",
  "videoPlays", "video3sViews", "thruplays", "videoP25", "videoP50", "videoP75", "videoP95", "videoP100", "videoAvgTimeSec",
  "postEngagement", "postReactions", "postComments", "postShares", "postSaves", "results",
] as const;

const BIGINT_KEYS = new Set(["impressions", "reach", "clicks", "linkClicks", "outboundClicks"]);

function dbValues(p: ParsedInsight & { results: number | null; resultType: string | null }) {
  const out: Record<string, unknown> = {};
  for (const k of VALUE_KEYS) {
    const v = p[k as keyof typeof p] as number | null;
    out[k] = v === null || v === undefined ? null : BIGINT_KEYS.has(k) ? BigInt(Math.round(v)) : new Prisma.Decimal(v);
  }
  return {
    ...out,
    resultType: p.resultType,
    currency: p.currency,
    objective: p.objective,
    optimizationGoal: p.optimizationGoal,
    attributionSetting: p.attributionSetting,
    actionsRaw: p.actionsRaw ? (p.actionsRaw as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    actionValuesRaw: p.actionValuesRaw ? (p.actionValuesRaw as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
  };
}

export interface IngestStats {
  received: number;
  inserted: number;
  updated: number;
  unchanged: number;
  stubsCreated: number;
}

export async function ingestInsights(account: { id: string; currency: string }, raw: RawInsightRow[]): Promise<IngestStats> {
  const stats: IngestStats = { received: raw.length, inserted: 0, updated: 0, unchanged: 0, stubsCreated: 0 };
  if (!raw.length) return stats;
  const parsed = raw.map((r) => parseInsightRow(r, account.currency));
  const { map, stubs } = await resolveIds(account.id, parsed);
  stats.stubsCreated = stubs;

  // Ad set goals drive the derived "results" column.
  const adSetIds = [...new Set([...map.values()].map((v) => v.adSetId))];
  const goals = new Map(
    (await prisma.adSet.findMany({ where: { id: { in: adSetIds } }, select: { id: true, optimizationGoal: true, promotedObject: true } })).map((s) => [
      s.id,
      { optimizationGoal: s.optimizationGoal, customEventType: ((s.promotedObject as { custom_event_type?: string } | null)?.custom_event_type ?? null) },
    ]),
  );

  // Last write wins within one payload for the same (ad, date).
  const byKey = new Map<string, { ids: ResolvedIds; p: ParsedInsight & { results: number | null; resultType: string | null }; hash: string }>();
  for (const p of parsed) {
    const ids = map.get(p.metaAdId)!;
    const g = goals.get(ids.adSetId) ?? { optimizationGoal: p.optimizationGoal, customEventType: null };
    const res = deriveResult({ optimizationGoal: g.optimizationGoal ?? p.optimizationGoal, customEventType: g.customEventType }, p);
    const full = { ...p, ...res };
    byKey.set(`${ids.adId}|${p.date}`, { ids, p: full, hash: insightHash(full) });
  }

  const entries = [...byKey.values()];
  const dates = [...new Set(entries.map((e) => e.p.date))].map((d) => new Date(`${d}T00:00:00Z`));
  const existing = await prisma.adInsightDaily.findMany({
    where: { adId: { in: [...new Set(entries.map((e) => e.ids.adId))] }, date: { in: dates } },
  });
  const existingByKey = new Map(existing.map((e) => [`${e.adId}|${e.date.toISOString().slice(0, 10)}`, e]));

  const toCreate: Prisma.AdInsightDailyCreateManyInput[] = [];
  const toUpdate: { row: (typeof existing)[number]; values: ReturnType<typeof dbValues>; hash: string; ids: ResolvedIds }[] = [];
  for (const e of entries) {
    const key = `${e.ids.adId}|${e.p.date}`;
    const prev = existingByKey.get(key);
    const values = dbValues(e.p);
    if (!prev) {
      toCreate.push({ adId: e.ids.adId, adAccountId: account.id, campaignId: e.ids.campaignId, adSetId: e.ids.adSetId, date: new Date(`${e.p.date}T00:00:00Z`), contentHash: e.hash, ...(values as object) } as Prisma.AdInsightDailyCreateManyInput);
    } else if (prev.contentHash !== e.hash) {
      toUpdate.push({ row: prev, values, hash: e.hash, ids: e.ids });
    } else {
      stats.unchanged++;
    }
  }

  if (toCreate.length) {
    const r = await prisma.adInsightDaily.createMany({ data: toCreate, skipDuplicates: true });
    stats.inserted += r.count;
  }
  for (let i = 0; i < toUpdate.length; i += 200) {
    const batch = toUpdate.slice(i, i + 200);
    await prisma.$transaction(
      batch.flatMap(({ row, values, hash, ids }) => {
        const previousValues = Object.fromEntries(
          [...VALUE_KEYS, "resultType", "attributionSetting"].map((k) => {
            const v = (row as Record<string, unknown>)[k];
            return [k, v === null || v === undefined ? null : typeof v === "bigint" ? Number(v) : v instanceof Prisma.Decimal ? v.toNumber() : v];
          }),
        );
        return [
          prisma.adInsightRevision.create({ data: { insightId: row.id, revision: row.revision, previousValues } }),
          prisma.adInsightDaily.update({
            where: { id: row.id },
            data: { ...(values as object), campaignId: ids.campaignId, adSetId: ids.adSetId, contentHash: hash, revision: { increment: 1 }, fetchedAt: new Date() } as Prisma.AdInsightDailyUncheckedUpdateInput,
          }),
        ];
      }),
    );
    stats.updated += batch.length;
  }
  return stats;
}

export type BreakdownKey = keyof typeof BREAKDOWN_PARAMS;

export async function ingestBreakdowns(account: { id: string; currency: string }, type: BreakdownKey, raw: (RawInsightRow & Record<string, string>)[]) {
  if (!raw.length) return { received: 0, upserted: 0 };
  const [p1, p2] = BREAKDOWN_PARAMS[type] as readonly string[];
  // One INSERT … ON CONFLICT cannot touch the same key twice, so de-duplicate first (last wins).
  raw = [...new Map(raw.map((r) => [`${r.ad_id}|${r.date_start}|${r[p1]}|${p2 ? r[p2] : ""}`, r])).values()];
  const { map } = await resolveIds(
    account.id,
    raw.map((r) => ({ metaAdId: r.ad_id, metaAdSetId: r.adset_id, metaCampaignId: r.campaign_id })),
  );
  let upserted = 0;
  for (let i = 0; i < raw.length; i += 500) {
    const chunk = raw.slice(i, i + 500);
    const values = chunk.map((r) => {
      const ids = map.get(r.ad_id)!;
      const num = (v?: string) => (v === undefined || v === "" ? null : Number(v));
      return Prisma.sql`(${ids.adId}, ${account.id}, ${r.date_start}::date, ${type}::"BreakdownType", ${r[p1] ?? "unknown"}, ${p2 ? r[p2] ?? "unknown" : ""},
        ${r.account_currency ?? account.currency}, ${num(r.spend) ?? 0}, ${Math.round(num(r.impressions) ?? 0)}::bigint, ${num(r.reach)}::bigint,
        ${num(r.clicks)}::bigint, ${num(r.inline_link_clicks)}::bigint,
        ${pickAction(r.actions, ACTION_PRECEDENCE.purchases) ?? 0}, ${pickAction(r.action_values, ACTION_PRECEDENCE.purchases) ?? 0}, now())`;
    });
    upserted += await prisma.$executeRaw`
      INSERT INTO ad_insight_breakdown_daily ("adId", "adAccountId", date, "breakdownType", dim1, dim2, currency, spend, impressions, reach, clicks, "linkClicks", purchases, "purchaseValue", "fetchedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("adId", date, "breakdownType", dim1, dim2) DO UPDATE SET
        spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, reach = EXCLUDED.reach, clicks = EXCLUDED.clicks,
        "linkClicks" = EXCLUDED."linkClicks", purchases = EXCLUDED.purchases, "purchaseValue" = EXCLUDED."purchaseValue",
        currency = EXCLUDED.currency, "fetchedAt" = now()`;
  }
  return { received: raw.length, upserted };
}
