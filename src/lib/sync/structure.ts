// Structure sync: campaigns → ad sets → ads → creatives. Discovers new and updated objects on
// every run; upserts are keyed on Meta ids so the job is idempotent.
import { prisma } from "@/lib/db";
import type { MetaClient, Params } from "@/lib/meta/client";
import { MetaApiError, rejectedField } from "@/lib/meta/errors";
import { ADSET_FIELDS, AD_FIELDS, CAMPAIGN_FIELDS, CREATIVE_FIELDS } from "@/lib/meta/fields";
import { creativeKind, parseBudget, parseMetaTime, type RawCreative } from "@/lib/meta/parse";
import type { Prisma } from "@/generated/prisma/client";

interface RawCampaign {
  id: string; name: string; objective?: string; status?: string; effective_status?: string; buying_type?: string;
  daily_budget?: string; lifetime_budget?: string; start_time?: string; stop_time?: string; created_time?: string; updated_time?: string;
}
interface RawAdSet {
  id: string; name: string; campaign_id: string; status?: string; effective_status?: string; optimization_goal?: string;
  billing_event?: string; bid_strategy?: string; daily_budget?: string; lifetime_budget?: string; attribution_spec?: unknown;
  promoted_object?: unknown; destination_type?: string; start_time?: string; end_time?: string; created_time?: string; updated_time?: string;
}
interface RawAd {
  id: string; name: string; adset_id: string; campaign_id: string; status?: string; effective_status?: string;
  creative?: { id: string }; preview_shareable_link?: string; created_time?: string; updated_time?: string;
}

/** Fetch every page, dropping fields Meta rejects instead of failing the whole sync. */
export async function getAllWithFieldFallback<T>(client: MetaClient, path: string, fields: string[], params: Params, onDrop: (f: string) => void): Promise<T[]> {
  let current = [...fields];
  for (let i = 0; i < 6; i++) {
    try {
      return await client.getAll<T>(path, { ...params, fields: current.join(",") });
    } catch (e) {
      if (!(e instanceof MetaApiError)) throw e;
      const bad = rejectedField(e, current);
      if (!bad || bad === "id" || bad === "name") throw e;
      onDrop(bad);
      current = current.filter((f) => f !== bad);
    }
  }
  throw new Error(`Too many rejected fields for ${path}`);
}

export interface StructureStats {
  campaigns: number;
  adSets: number;
  ads: number;
  newAds: number;
  creativesFetched: number;
  droppedFields: string[];
}

export async function syncStructure(
  client: MetaClient,
  account: { id: string; metaAccountId: string; currency: string },
  heartbeat: () => Promise<void>,
): Promise<StructureStats> {
  const dropped: string[] = [];
  const onDrop = (f: string) => dropped.push(f);
  const now = new Date();
  const act = account.metaAccountId;

  // Campaigns
  const campaigns = await getAllWithFieldFallback<RawCampaign>(client, `${act}/campaigns`, CAMPAIGN_FIELDS, { limit: 200 }, onDrop);
  const campaignIds = new Map<string, string>();
  for (const c of campaigns) {
    const data = {
      adAccountId: account.id, name: c.name, objective: c.objective ?? null, status: c.status ?? null, effectiveStatus: c.effective_status ?? null,
      buyingType: c.buying_type ?? null, dailyBudget: parseBudget(c.daily_budget, account.currency), lifetimeBudget: parseBudget(c.lifetime_budget, account.currency),
      startTime: parseMetaTime(c.start_time), stopTime: parseMetaTime(c.stop_time), metaCreatedTime: parseMetaTime(c.created_time), metaUpdatedTime: parseMetaTime(c.updated_time), lastSeenAt: now,
    };
    const row = await prisma.campaign.upsert({ where: { metaCampaignId: c.id }, create: { metaCampaignId: c.id, ...data }, update: data, select: { id: true } });
    campaignIds.set(c.id, row.id);
  }
  await heartbeat();

  // Ad sets
  const adSets = await getAllWithFieldFallback<RawAdSet>(client, `${act}/adsets`, ADSET_FIELDS, { limit: 200 }, onDrop);
  const adSetIds = new Map<string, string>();
  for (const s of adSets) {
    const campaignId = campaignIds.get(s.campaign_id) ?? (await ensureCampaignStub(account.id, s.campaign_id, null));
    const data = {
      adAccountId: account.id, campaignId, name: s.name, status: s.status ?? null, effectiveStatus: s.effective_status ?? null,
      optimizationGoal: s.optimization_goal ?? null, billingEvent: s.billing_event ?? null, bidStrategy: s.bid_strategy ?? null,
      destinationType: s.destination_type ?? null, dailyBudget: parseBudget(s.daily_budget, account.currency), lifetimeBudget: parseBudget(s.lifetime_budget, account.currency),
      attributionSpec: (s.attribution_spec ?? undefined) as Prisma.InputJsonValue | undefined, promotedObject: (s.promoted_object ?? undefined) as Prisma.InputJsonValue | undefined,
      startTime: parseMetaTime(s.start_time), endTime: parseMetaTime(s.end_time), metaCreatedTime: parseMetaTime(s.created_time), metaUpdatedTime: parseMetaTime(s.updated_time), lastSeenAt: now,
    };
    const row = await prisma.adSet.upsert({ where: { metaAdSetId: s.id }, create: { metaAdSetId: s.id, ...data }, update: data, select: { id: true } });
    adSetIds.set(s.id, row.id);
  }
  await heartbeat();

  // Ads
  const ads = await getAllWithFieldFallback<RawAd>(client, `${act}/ads`, AD_FIELDS, { limit: 200 }, onDrop);
  const existingAds = new Set((await prisma.ad.findMany({ where: { adAccountId: account.id }, select: { metaAdId: true } })).map((a) => a.metaAdId));
  const creativeIds = new Set<string>();
  let newAds = 0;
  for (const a of ads) {
    const campaignId = campaignIds.get(a.campaign_id) ?? (await ensureCampaignStub(account.id, a.campaign_id, null));
    const adSetId = adSetIds.get(a.adset_id) ?? (await ensureAdSetStub(account.id, campaignId, a.adset_id, null));
    if (a.creative?.id) creativeIds.add(a.creative.id);
    const data = {
      adAccountId: account.id, campaignId, adSetId, name: a.name, status: a.status ?? null, effectiveStatus: a.effective_status ?? null,
      metaCreativeId: a.creative?.id ?? null, previewShareableLink: a.preview_shareable_link ?? null,
      metaCreatedTime: parseMetaTime(a.created_time), metaUpdatedTime: parseMetaTime(a.updated_time), lastSeenAt: now,
    };
    await prisma.ad.upsert({ where: { metaAdId: a.id }, create: { metaAdId: a.id, ...data }, update: data });
    if (!existingAds.has(a.id)) newAds++;
  }
  await heartbeat();

  // Creatives: fetch new ones and refresh expiring thumbnail URLs (older than 20h).
  const staleBefore = new Date(Date.now() - 20 * 3_600_000);
  const known = await prisma.adCreative.findMany({ where: { metaCreativeId: { in: [...creativeIds] } }, select: { metaCreativeId: true, fetchedAt: true } });
  const fresh = new Set(known.filter((k) => k.fetchedAt > staleBefore).map((k) => k.metaCreativeId));
  const toFetch = [...creativeIds].filter((id) => !fresh.has(id));
  let creativesFetched = 0;
  let creativeFields = [...CREATIVE_FIELDS];
  for (let i = 0; i < toFetch.length; i += 50) {
    const chunk = toFetch.slice(i, i + 50);
    let res: Record<string, RawCreative> | null = null;
    for (let tries = 0; tries < 5 && !res; tries++) {
      try {
        res = await client.get<Record<string, RawCreative>>("", { ids: chunk.join(","), fields: creativeFields.join(","), thumbnail_width: 480, thumbnail_height: 480 });
      } catch (e) {
        if (!(e instanceof MetaApiError)) throw e;
        const bad = rejectedField(e, creativeFields);
        if (bad && bad !== "id") {
          dropped.push(bad);
          creativeFields = creativeFields.filter((f) => f !== bad);
          continue;
        }
        // Permission errors on individual creatives (e.g. creatives owned by another business) are skipped.
        if (e.kind === "permission") break;
        throw e;
      }
    }
    for (const c of Object.values(res ?? {})) {
      const data = {
        adAccountId: account.id, name: c.name ?? null, title: c.title ?? null, body: c.body ?? null, objectType: c.object_type ?? null,
        creativeType: creativeKind(c), thumbnailUrl: c.thumbnail_url ?? null, imageUrl: c.image_url ?? null,
        videoId: c.video_id ?? c.object_story_spec?.video_data?.video_id ?? null, effectiveObjectStoryId: c.effective_object_story_id ?? null,
        instagramPermalinkUrl: c.instagram_permalink_url ?? null, fetchedAt: new Date(),
      };
      await prisma.adCreative.upsert({ where: { metaCreativeId: c.id }, create: { metaCreativeId: c.id, ...data }, update: data });
      creativesFetched++;
    }
    await heartbeat();
  }

  // Link ads to creative rows.
  await prisma.$executeRaw`
    UPDATE ad SET "creativeId" = c.id FROM ad_creative c
    WHERE ad."metaCreativeId" = c."metaCreativeId" AND ad."adAccountId" = ${account.id}
      AND (ad."creativeId" IS DISTINCT FROM c.id)`;

  return { campaigns: campaigns.length, adSets: adSets.length, ads: ads.length, newAds, creativesFetched, droppedFields: [...new Set(dropped)] };
}

/** Minimal rows for objects seen in insights but not (yet / anymore) listed by the structure endpoints, e.g. deleted ads. */
export async function ensureCampaignStub(adAccountId: string, metaCampaignId: string, name: string | null): Promise<string> {
  const row = await prisma.campaign.upsert({
    where: { metaCampaignId },
    create: { metaCampaignId, adAccountId, name: name ?? `Campaign ${metaCampaignId}` },
    update: {},
    select: { id: true },
  });
  return row.id;
}

export async function ensureAdSetStub(adAccountId: string, campaignId: string, metaAdSetId: string, name: string | null): Promise<string> {
  const row = await prisma.adSet.upsert({
    where: { metaAdSetId },
    create: { metaAdSetId, adAccountId, campaignId, name: name ?? `Ad set ${metaAdSetId}` },
    update: {},
    select: { id: true },
  });
  return row.id;
}

export async function ensureAdStub(adAccountId: string, campaignId: string, adSetId: string, metaAdId: string, name: string | null): Promise<string> {
  const row = await prisma.ad.upsert({
    where: { metaAdId },
    create: { metaAdId, adAccountId, campaignId, adSetId, name: name ?? `Ad ${metaAdId}` },
    update: {},
    select: { id: true },
  });
  return row.id;
}
