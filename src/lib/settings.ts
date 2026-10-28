import { z } from "zod";
import { prisma } from "@/lib/db";

export const settingsSchema = z.object({
  reportingTimezone: z.string().min(1).refine(isValidTimeZone, "Unknown IANA time zone"),
  /** Hourly sync re-fetches this many recent days. */
  recentRefreshDays: z.number().int().min(1).max(14),
  /** Once a day, re-fetch this many days to capture late attribution (Meta attribution windows can update for up to 28 days). */
  attributionRefreshDays: z.number().int().min(7).max(90),
  /** Initial backfill depth. Meta's Insights API retains most data for 37 months. */
  backfillMonths: z.number().int().min(1).max(37),
  /** Breakdown (age/gender/placement/geo) history to keep in sync. */
  breakdownDays: z.number().int().min(0).max(395),
  /** Leaderboard sample-size guards. */
  minSpendForRanking: z.number().min(0),
  minPurchasesForRanking: z.number().min(0),
  minImpressionsForRanking: z.number().min(0),
  /** Hours after which data is flagged as stale in the UI. */
  staleAfterHours: z.number().min(1).max(168),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  reportingTimezone: "Asia/Kolkata",
  recentRefreshDays: 3,
  attributionRefreshDays: 28,
  backfillMonths: 37,
  breakdownDays: 90,
  minSpendForRanking: 5000,
  minPurchasesForRanking: 5,
  minImpressionsForRanking: 2000,
  staleAfterHours: 6,
};

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.appSetting.findMany();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<AppSettings>, userId: string | null): Promise<AppSettings> {
  const current = await getSettings();
  const next = settingsSchema.parse({ ...current, ...patch });
  await prisma.$transaction(
    Object.entries(patch).map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        create: { key, value: value as never, updatedById: userId },
        update: { value: value as never, updatedById: userId },
      }),
    ),
  );
  return next;
}
