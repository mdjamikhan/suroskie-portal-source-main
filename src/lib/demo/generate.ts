// Synthetic DEMO data. Everything created here is flagged isDemo (accounts, connection) and
// named "DEMO …" so it can never be mistaken for, or mixed with, real Meta reporting. Reports
// show demo accounts only when DEMO_MODE=true, and real accounts only when it is false.
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { encryptSecret } from "@/lib/crypto";
import { addDays, todayIn } from "@/lib/reporting/date-range";
import { matchCreator } from "@/lib/mapping/naming";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CREATORS = [
  ["DEMO-CR01", "Aanya Kapoor (Demo)", "demo.aanya"],
  ["DEMO-CR02", "Rohan Mehta (Demo)", "demo.rohan"],
  ["DEMO-CR03", "Ishita Rao (Demo)", "demo.ishita"],
  ["DEMO-CR04", "Kabir Singh (Demo)", "demo.kabir"],
  ["DEMO-CR05", "Meera Iyer (Demo)", "demo.meera"],
  ["DEMO-CR06", "Arjun Nair (Demo)", "demo.arjun"],
  ["DEMO-CR07", "Sana Sheikh (Demo)", "demo.sana"],
  ["DEMO-CR08", "Dev Malhotra (Demo)", "demo.dev"],
] as const;

const PRODUCTS = ["Vitamin C Serum", "Sunscreen SPF 50", "Onion Hair Oil", "Retinol Night Cream"];
const ANGLES = ["Problem–solution", "Before/after", "Routine GRWM", "Ingredient explainer", "Unboxing", "Testimonial"];
const HOOKS = ["\"I stopped buying 5 serums…\"", "\"Dermat asked me one question\"", "\"30 days, no filter\"", "\"POV: humid Mumbai summer\"", "\"Don't skip step 3\""];

export async function demoDataBlocked(prisma: PrismaClient): Promise<boolean> {
  return (await prisma.adAccount.count({ where: { isDemo: false } })) > 0;
}

export async function clearDemoData(prisma: PrismaClient) {
  const accounts = await prisma.adAccount.findMany({ where: { isDemo: true }, select: { id: true } });
  const ids = accounts.map((a) => a.id);
  await prisma.adCreatorMapping.deleteMany({ where: { ad: { adAccountId: { in: ids } } } });
  await prisma.adAccount.deleteMany({ where: { id: { in: ids } } }); // cascades to campaigns/ads/insights/jobs
  await prisma.metaConnection.deleteMany({ where: { isDemo: true } });
  await prisma.creativeAsset.deleteMany({ where: { creator: { code: { startsWith: "DEMO-" } } } });
  await prisma.creator.deleteMany({ where: { code: { startsWith: "DEMO-" } } });
  await prisma.namingRule.deleteMany({ where: { name: { startsWith: "DEMO" } } });
}

export async function seedDemoData(prisma: PrismaClient, opts: { days?: number; now?: Date; seed?: number } = {}) {
  const days = opts.days ?? 120;
  const rand = mulberry32(opts.seed ?? 20241027);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (a: number, b: number) => a + rand() * (b - a);
  const today = todayIn("Asia/Kolkata", opts.now ?? new Date());
  const now = opts.now ?? new Date();

  await clearDemoData(prisma);

  const connection = await prisma.metaConnection.create({
    data: { label: "DEMO connection (synthetic data — not connected to Meta)", authType: "SYSTEM_USER_TOKEN", encryptedToken: encryptSecret("demo-no-real-token"), isDemo: true, status: "ACTIVE", metaUserName: "Demo", scopes: ["ads_read"] },
  });

  const creators = [];
  for (const [code, name, handle] of CREATORS) {
    creators.push(await prisma.creator.create({ data: { code, name, instagramHandle: handle, notes: "Synthetic demo creator", team: rand() > 0.5 ? "Skincare content" : "Haircare content", isActive: code !== "DEMO-CR08" } }));
  }
  const assets: { id: string; creatorId: string; product: string | null; creativeType: "VIDEO" | "IMAGE" | "CAROUSEL" }[] = [];
  for (const c of creators) {
    const n = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const creativeType = rand() < 0.65 ? "VIDEO" : rand() < 0.7 ? "IMAGE" : "CAROUSEL";
      const a = await prisma.creativeAsset.create({
        data: { creatorId: c.id, title: `${c.name.split(" ")[0]} — ${pick(ANGLES)} #${i + 1}`, creativeType, contentAngle: pick(ANGLES), hook: pick(HOOKS), product: pick(PRODUCTS), tags: ["demo"], launchDate: new Date(`${addDays(today, -Math.floor(between(20, days)))}T00:00:00Z`) },
      });
      assets.push({ id: a.id, creatorId: c.id, product: a.product, creativeType });
    }
  }

  await prisma.namingRule.create({ data: { name: "DEMO: creator code in ad name", source: "AD_NAME", matchField: "CREATOR_CODE", prefix: "", priority: 10 } });

  const accountDefs = [
    { meta: "act_demo_100001", name: "DEMO — Suroskie India (synthetic)" },
    { meta: "act_demo_100002", name: "DEMO — Suroskie Retargeting (synthetic)" },
  ];
  const campaignDefs = [
    { name: "DEMO | Prospecting | Sales", objective: "OUTCOME_SALES", goal: "OFFSITE_CONVERSIONS", event: "PURCHASE" },
    { name: "DEMO | Creator UGC | Sales", objective: "OUTCOME_SALES", goal: "OFFSITE_CONVERSIONS", event: "PURCHASE" },
    { name: "DEMO | Video Views | Awareness", objective: "OUTCOME_AWARENESS", goal: "THRUPLAY", event: null },
    { name: "DEMO | Traffic | Consideration", objective: "OUTCOME_TRAFFIC", goal: "LANDING_PAGE_VIEWS", event: null },
  ];
  const attributionSpec = [{ event_type: "CLICK_THROUGH", window_days: 7 }, { event_type: "VIEW_THROUGH", window_days: 1 }];

  const insightRows: Prisma.AdInsightDailyCreateManyInput[] = [];
  const breakdownRows: Prisma.AdInsightBreakdownDailyCreateManyInput[] = [];
  let adCounter = 0;

  for (const [ai, def] of accountDefs.entries()) {
    const account = await prisma.adAccount.create({
      data: {
        metaAccountId: def.meta, name: def.name, currency: "INR", timezoneName: "Asia/Kolkata", accountStatus: 1, connectionId: connection.id,
        syncEnabled: true, isDemo: true, historyStartDate: new Date(`${addDays(today, -days)}T00:00:00Z`), backfillQueuedAt: now,
        lastStructureSyncAt: now, lastInsightsSyncAt: now, lastSuccessfulSyncAt: now, lastAttributionRefreshAt: now, syncHealth: "OK",
      },
    });
    for (const [ci, cdef] of campaignDefs.entries()) {
      if (ai === 1 && ci > 1) continue;
      const campaign = await prisma.campaign.create({
        data: { metaCampaignId: `demo_c_${ai}_${ci}`, adAccountId: account.id, name: cdef.name, objective: cdef.objective, status: "ACTIVE", effectiveStatus: ci === 3 ? "PAUSED" : "ACTIVE", buyingType: "AUCTION", dailyBudget: new Prisma.Decimal(Math.round(between(15000, 60000))) },
      });
      for (let si = 0; si < 2; si++) {
        const adSet = await prisma.adSet.create({
          data: {
            metaAdSetId: `demo_s_${ai}_${ci}_${si}`, adAccountId: account.id, campaignId: campaign.id, name: `${cdef.name} | ${si === 0 ? "Broad 18-44" : "Interest: Skincare"}`,
            status: "ACTIVE", effectiveStatus: campaign.effectiveStatus, optimizationGoal: cdef.goal, billingEvent: "IMPRESSIONS",
            attributionSpec, promotedObject: cdef.event ? { pixel_id: "demo_pixel", custom_event_type: cdef.event } : Prisma.DbNull,
          },
        });
        const adsInSet = 3 + Math.floor(rand() * 3);
        for (let k = 0; k < adsInSet; k++) {
          adCounter++;
          const asset = pick(assets);
          const creator = creators.find((c) => c.id === asset.creatorId)!;
          const mappedByName = rand() < 0.85;
          const adName = mappedByName
            ? `S25_${creator.code}_${asset.product?.split(" ")[0] ?? "Prod"}_Hook${String.fromCharCode(65 + (k % 4))}`
            : `S25_UGC_${asset.product?.split(" ")[0] ?? "Prod"}_v${k + 1}`;
          const creative = await prisma.adCreative.create({
            data: { metaCreativeId: `demo_cr_${adCounter}`, adAccountId: account.id, name: adName, creativeType: asset.creativeType, objectType: asset.creativeType === "VIDEO" ? "VIDEO" : asset.creativeType === "IMAGE" ? "PHOTO" : "SHARE", title: "Glow that lasts", body: "Synthetic demo creative" },
          });
          const start = Math.floor(between(0, days * 0.7));
          const life = Math.floor(between(14, days));
          const paused = rand() < 0.25;
          const ad = await prisma.ad.create({
            data: { metaAdId: `demo_ad_${adCounter}`, adAccountId: account.id, campaignId: campaign.id, adSetId: adSet.id, name: adName, status: paused ? "PAUSED" : "ACTIVE", effectiveStatus: paused ? "PAUSED" : campaign.effectiveStatus, metaCreativeId: creative.metaCreativeId, creativeId: creative.id, metaCreatedTime: new Date(`${addDays(today, -days + start)}T05:00:00Z`) },
          });
          if (mappedByName && rand() < 0.5) {
            // Half of the convention-named ads are pre-linked to their asset to show asset-level reporting.
            await prisma.adCreatorMapping.create({ data: { adId: ad.id, creatorId: creator.id, creativeAssetId: asset.id, method: "MANUAL" } });
          }

          // Per-ad quality so creatives genuinely differ.
          const q = { ctr: between(0.006, 0.022), cvr: between(0.01, 0.06), aov: between(1100, 2600), cpm: between(110, 320), hook: between(0.18, 0.42), thru: between(0.25, 0.6) };
          const isVideo = asset.creativeType === "VIDEO";
          for (let d = start; d < Math.min(days, start + life); d++) {
            const date = addDays(today, -days + d);
            if (date > today) break;
            const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
            const seasonal = 1 + 0.25 * Math.sin((d / days) * Math.PI * 2) + (weekday === 0 || weekday === 6 ? 0.12 : 0);
            const spend = Math.round(between(400, 6500) * seasonal * (cdef.goal === "THRUPLAY" ? 0.6 : 1) * 100) / 100;
            const impressions = Math.max(1, Math.round((spend / q.cpm) * 1000 * between(0.85, 1.15)));
            const reach = Math.round(impressions / between(1.05, 1.6));
            const linkClicks = Math.round(impressions * q.ctr * between(0.8, 1.2));
            const clicks = Math.round(linkClicks * between(1.3, 1.8));
            const outbound = Math.round(linkClicks * between(0.85, 0.97));
            const lpv = Math.round(outbound * between(0.6, 0.85));
            const conversionWeight = cdef.event === "PURCHASE" ? 1 : 0.25;
            const purchases = Math.round(lpv * q.cvr * conversionWeight * between(0.6, 1.4));
            const value = Math.round(purchases * q.aov * between(0.85, 1.2) * 100) / 100;
            const plays = isVideo ? Math.round(impressions * between(0.5, 0.8)) : null;
            const v3 = isVideo ? Math.round(impressions * q.hook * between(0.9, 1.1)) : null;
            const thru = isVideo ? Math.round((v3 ?? 0) * q.thru) : null;
            const resultCount = cdef.goal === "THRUPLAY" ? thru ?? 0 : cdef.goal === "LANDING_PAGE_VIEWS" ? lpv : purchases;
            const resultType = cdef.goal === "THRUPLAY" ? "thruplay" : cdef.goal === "LANDING_PAGE_VIEWS" ? "landing_page_view" : "purchase";
            insightRows.push({
              adId: ad.id, adAccountId: account.id, campaignId: campaign.id, adSetId: adSet.id, date: new Date(`${date}T00:00:00Z`), currency: "INR",
              spend: new Prisma.Decimal(spend), impressions: BigInt(impressions), reach: BigInt(reach), clicks: BigInt(clicks), linkClicks: BigInt(linkClicks), outboundClicks: BigInt(outbound),
              landingPageViews: new Prisma.Decimal(lpv), purchases: new Prisma.Decimal(purchases), purchaseValue: new Prisma.Decimal(value),
              websitePurchases: new Prisma.Decimal(Math.round(purchases * 0.92)), websitePurchaseValue: new Prisma.Decimal(Math.round(value * 0.92 * 100) / 100),
              addToCart: new Prisma.Decimal(Math.round(lpv * between(0.08, 0.18))), initiateCheckout: new Prisma.Decimal(Math.round(purchases * between(1.4, 2.2))),
              viewContent: new Prisma.Decimal(Math.round(lpv * between(0.7, 0.95))), leads: new Prisma.Decimal(0), completeRegistration: new Prisma.Decimal(Math.round(purchases * 0.3)),
              videoPlays: plays === null ? null : new Prisma.Decimal(plays), video3sViews: v3 === null ? null : new Prisma.Decimal(v3), thruplays: thru === null ? null : new Prisma.Decimal(thru),
              videoP25: v3 === null ? null : new Prisma.Decimal(Math.round(v3 * 0.62)), videoP50: v3 === null ? null : new Prisma.Decimal(Math.round(v3 * 0.41)),
              videoP75: v3 === null ? null : new Prisma.Decimal(Math.round(v3 * 0.27)), videoP95: v3 === null ? null : new Prisma.Decimal(Math.round(v3 * 0.17)),
              videoP100: v3 === null ? null : new Prisma.Decimal(Math.round(v3 * 0.14)), videoAvgTimeSec: isVideo ? new Prisma.Decimal(Math.round(between(3.5, 11) * 10) / 10) : null,
              postEngagement: new Prisma.Decimal(Math.round(clicks + (v3 ?? 0) * 0.3)), postReactions: new Prisma.Decimal(Math.round(impressions * 0.0015)), postComments: new Prisma.Decimal(Math.round(impressions * 0.0002)),
              postShares: new Prisma.Decimal(Math.round(impressions * 0.0001)), postSaves: new Prisma.Decimal(Math.round(impressions * 0.0003)),
              results: new Prisma.Decimal(resultCount), resultType, objective: cdef.objective, optimizationGoal: cdef.goal, attributionSetting: "7d_click_1d_view",
              contentHash: randomUUID(),
            });
            if (d >= days - 30) {
              const shares: [string, string, number][] = [["18-24", "female", 0.24], ["25-34", "female", 0.31], ["35-44", "female", 0.12], ["18-24", "male", 0.11], ["25-34", "male", 0.15], ["35-44", "male", 0.07]];
              for (const [age, gender, w] of shares) {
                breakdownRows.push({ adId: ad.id, adAccountId: account.id, date: new Date(`${date}T00:00:00Z`), breakdownType: "AGE_GENDER", dim1: age, dim2: gender, currency: "INR", spend: new Prisma.Decimal(Math.round(spend * w * 100) / 100), impressions: BigInt(Math.round(impressions * w)), reach: BigInt(Math.round(reach * w)), clicks: BigInt(Math.round(clicks * w)), linkClicks: BigInt(Math.round(linkClicks * w)), purchases: new Prisma.Decimal(Math.round(purchases * w * between(0.7, 1.3))), purchaseValue: new Prisma.Decimal(Math.round(value * w * 100) / 100) });
              }
              const placements: [string, string, number][] = [["instagram", "reels", 0.38], ["instagram", "feed", 0.22], ["instagram", "story", 0.14], ["facebook", "feed", 0.18], ["facebook", "facebook_reels", 0.08]];
              for (const [platform, position, w] of placements) {
                breakdownRows.push({ adId: ad.id, adAccountId: account.id, date: new Date(`${date}T00:00:00Z`), breakdownType: "PLATFORM_POSITION", dim1: platform, dim2: position, currency: "INR", spend: new Prisma.Decimal(Math.round(spend * w * 100) / 100), impressions: BigInt(Math.round(impressions * w)), reach: BigInt(Math.round(reach * w)), clicks: BigInt(Math.round(clicks * w)), linkClicks: BigInt(Math.round(linkClicks * w)), purchases: new Prisma.Decimal(Math.round(purchases * w)), purchaseValue: new Prisma.Decimal(Math.round(value * w * 100) / 100) });
              }
            }
          }
        }
      }
    }
  }

  for (let i = 0; i < insightRows.length; i += 2000) await prisma.adInsightDaily.createMany({ data: insightRows.slice(i, i + 2000) });
  for (let i = 0; i < breakdownRows.length; i += 4000) await prisma.adInsightBreakdownDaily.createMany({ data: breakdownRows.slice(i, i + 4000) });

  // Apply the naming rule to the remaining demo ads, leaving non-conforming names unmapped for review.
  const rules = await prisma.namingRule.findMany({ where: { enabled: true } });
  const unmapped = await prisma.ad.findMany({ where: { mapping: null, adAccount: { isDemo: true } }, select: { id: true, name: true, adSet: { select: { name: true } }, campaign: { select: { name: true } } } });
  let mapped = 0;
  for (const ad of unmapped) {
    const m = matchCreator({ adName: ad.name, adSetName: ad.adSet.name, campaignName: ad.campaign.name }, rules, creators);
    if (m.kind === "match") {
      await prisma.adCreatorMapping.create({ data: { adId: ad.id, creatorId: m.creatorId, method: "NAMING_RULE", namingRuleId: m.ruleId } });
      mapped++;
    }
  }
  return { ads: adCounter, insightRows: insightRows.length, breakdownRows: breakdownRows.length, mappedByRule: mapped, creators: creators.length };
}
