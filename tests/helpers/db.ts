// Test-database utilities: reset, reference data and compact fixtures with known numbers.
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { seedReferenceData } from "@/lib/bootstrap";
import { loadAccessContext } from "@/lib/access/load";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await seedReferenceData(prisma);
}

export async function makeUser(opts: {
  email: string;
  role: "super_admin" | "marketing_manager" | "content_manager" | "creator_viewer";
  creators?: string[];
  accounts?: string[];
  metricOverrides?: { key: string; granted: boolean }[];
  permissionOverrides?: { key: string; granted: boolean }[];
  password?: string;
  status?: "ACTIVE" | "SUSPENDED" | "INVITED";
  maxLookbackDays?: number | null;
}) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: opts.role } });
  const id = randomUUID();
  await prisma.user.create({
    data: {
      id, email: opts.email, name: opts.email.split("@")[0], status: opts.status ?? "ACTIVE", emailVerified: true,
      maxLookbackDays: opts.maxLookbackDays ?? null,
      roles: { create: [{ roleId: role.id }] },
      creatorAccess: { create: (opts.creators ?? []).map((creatorId) => ({ creatorId })) },
      adAccountAccess: { create: (opts.accounts ?? []).map((adAccountId) => ({ adAccountId })) },
      metricOverrides: { create: (opts.metricOverrides ?? []).map((m) => ({ metricKey: m.key, granted: m.granted })) },
      permissionOverrides: { create: (opts.permissionOverrides ?? []).map((p) => ({ permissionKey: p.key, granted: p.granted })) },
    },
  });
  if (opts.password) {
    await prisma.account.create({ data: { id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(opts.password) } });
  }
  return id;
}

export const ctxFor = (userId: string) => loadAccessContext(userId);

/**
 * Two accounts (one real, one demo), two creators, four ads:
 *   adA1, adA2 → creator A (account 1)
 *   adB1       → creator B (account 1)
 *   adU        → unmapped  (account 1)
 *   adD        → creator A (DEMO account) — must never appear in real-mode reports
 * Each ad has rows for 2026-10-01..2026-10-03 with spend = base, purchases, value as below.
 */
export async function makeFixture() {
  const conn = await prisma.metaConnection.create({ data: { label: "test", authType: "SYSTEM_USER_TOKEN", encryptedToken: "v1:x:y:z" } });
  const acc1 = await prisma.adAccount.create({ data: { metaAccountId: "act_1", name: "Real account", currency: "INR", timezoneName: "Asia/Kolkata", connectionId: conn.id, syncEnabled: true, lastSuccessfulSyncAt: new Date() } });
  const acc2 = await prisma.adAccount.create({ data: { metaAccountId: "act_2", name: "Second real account", currency: "INR", timezoneName: "Asia/Kolkata" } });
  const demo = await prisma.adAccount.create({ data: { metaAccountId: "act_demo", name: "DEMO", currency: "INR", timezoneName: "Asia/Kolkata", isDemo: true } });
  const creatorA = await prisma.creator.create({ data: { code: "CRA", name: "Creator A" } });
  const creatorB = await prisma.creator.create({ data: { code: "CRB", name: "Creator B" } });

  async function ad(account: { id: string }, key: string) {
    const c = await prisma.campaign.upsert({ where: { metaCampaignId: `c_${account.id}` }, create: { metaCampaignId: `c_${account.id}`, adAccountId: account.id, name: `Campaign ${account.id}`, effectiveStatus: "ACTIVE" }, update: {} });
    const s = await prisma.adSet.upsert({ where: { metaAdSetId: `s_${account.id}` }, create: { metaAdSetId: `s_${account.id}`, adAccountId: account.id, campaignId: c.id, name: "Ad set", optimizationGoal: "OFFSITE_CONVERSIONS" }, update: {} });
    return prisma.ad.create({ data: { metaAdId: key, adAccountId: account.id, campaignId: c.id, adSetId: s.id, name: `Ad ${key}`, effectiveStatus: "ACTIVE" } });
  }
  const adA1 = await ad(acc1, "adA1");
  const adA2 = await ad(acc1, "adA2");
  const adB1 = await ad(acc1, "adB1");
  const adU = await ad(acc1, "adU");
  const adC = await ad(acc2, "adC");
  const adD = await ad(demo, "adD");
  await prisma.adCreatorMapping.createMany({
    data: [
      { adId: adA1.id, creatorId: creatorA.id, method: "MANUAL" },
      { adId: adA2.id, creatorId: creatorA.id, method: "MANUAL" },
      { adId: adB1.id, creatorId: creatorB.id, method: "MANUAL" },
      { adId: adC.id, creatorId: creatorB.id, method: "MANUAL" },
      { adId: adD.id, creatorId: creatorA.id, method: "MANUAL" },
    ],
  });
  // spend, purchases, value per day
  const plan: [typeof adA1, number, number, number][] = [
    [adA1, 1000, 10, 5000], // ROAS 5
    [adA2, 3000, 2, 3000], // ROAS 1
    [adB1, 2000, 4, 2000], // ROAS 1
    [adU, 500, 0, 0],
    [adC, 700, 1, 1400],
    [adD, 99999, 999, 999999],
  ];
  const rows: Prisma.AdInsightDailyCreateManyInput[] = [];
  for (const [a, spend, purchases, value] of plan) {
    for (const date of ["2026-10-01", "2026-10-02", "2026-10-03"]) {
      rows.push({
        adId: a.id, adAccountId: a.adAccountId, campaignId: a.campaignId, adSetId: a.adSetId, date: new Date(`${date}T00:00:00Z`), currency: "INR",
        spend: new Prisma.Decimal(spend), impressions: BigInt(spend * 10), reach: BigInt(spend * 8), clicks: BigInt(Math.round(spend / 10)), linkClicks: BigInt(Math.round(spend / 20)), outboundClicks: BigInt(Math.round(spend / 25)),
        purchases: new Prisma.Decimal(purchases), purchaseValue: new Prisma.Decimal(value), contentHash: randomUUID(),
      });
    }
  }
  await prisma.adInsightDaily.createMany({ data: rows });
  return { conn, acc1, acc2, demo, creatorA, creatorB, adA1, adA2, adB1, adU, adC, adD };
}

export const RANGE = { range: "custom", from: "2026-10-01", to: "2026-10-03" };
