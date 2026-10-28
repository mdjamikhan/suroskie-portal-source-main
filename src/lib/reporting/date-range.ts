// Date ranges are plain "YYYY-MM-DD" strings interpreted as calendar days. "Today" is
// computed in the configured reporting time zone (Asia/Kolkata by default). Meta reports
// each day in the ad account's own time zone, which the UI states alongside the range.
import { formatInTimeZone } from "date-fns-tz";
import { ValidationError } from "@/lib/errors";

export const PRESETS = ["today", "yesterday", "last_7d", "last_30d", "last_90d", "custom"] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<Preset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7d: "Last 7 days",
  last_30d: "Last 30 days",
  last_90d: "Last 90 days",
  custom: "Custom range",
};

export interface DateRange {
  preset: Preset;
  from: string;
  to: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_RANGE_DAYS = 1200;

export function isIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Last N days" excludes today (matching Meta's last_Nd presets), so data is complete-day only. */
export function presetRange(preset: Exclude<Preset, "custom">, timeZone: string, now: Date = new Date()): DateRange {
  const today = todayIn(timeZone, now);
  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { preset, from: y, to: y };
    }
    case "last_7d":
      return { preset, from: addDays(today, -7), to: addDays(today, -1) };
    case "last_30d":
      return { preset, from: addDays(today, -30), to: addDays(today, -1) };
    case "last_90d":
      return { preset, from: addDays(today, -90), to: addDays(today, -1) };
  }
}

export function parseDateRange(
  params: { range?: string | null; from?: string | null; to?: string | null },
  timeZone: string,
  now: Date = new Date(),
): DateRange {
  const preset = (params.range ?? "last_30d") as Preset;
  if (!PRESETS.includes(preset)) throw new ValidationError("Unknown date range");
  if (preset !== "custom") return presetRange(preset, timeZone, now);
  const { from, to } = params;
  if (!from || !to || !isIsoDate(from) || !isIsoDate(to)) throw new ValidationError("Custom ranges need valid from/to dates (YYYY-MM-DD)");
  if (from > to) throw new ValidationError("The start date must be on or before the end date");
  if (diffDays(from, to) + 1 > MAX_RANGE_DAYS) throw new ValidationError(`Date ranges are limited to ${MAX_RANGE_DAYS} days`);
  return { preset, from, to };
}

export interface ClampResult {
  range: DateRange;
  /** True when the requested start was moved forward to respect the user's date permissions. */
  clamped: boolean;
  /** True when nothing in the requested range is visible to the user. */
  empty: boolean;
  earliestAllowed: string | null;
}

/**
 * Enforce a user's authorised date window server-side. The lower bound is the later of the
 * admin-set earliest date and (today − maxLookbackDays).
 */
export function clampRange(
  range: DateRange,
  access: { maxLookbackDays: number | null; earliestDataDate: string | null },
  timeZone: string,
  now: Date = new Date(),
): ClampResult {
  const bounds: string[] = [];
  if (access.maxLookbackDays !== null) bounds.push(addDays(todayIn(timeZone, now), -access.maxLookbackDays));
  if (access.earliestDataDate) bounds.push(access.earliestDataDate);
  const earliest = bounds.length ? bounds.sort().at(-1)! : null;
  if (!earliest || range.from >= earliest) return { range, clamped: false, empty: false, earliestAllowed: earliest };
  if (range.to < earliest) return { range, clamped: true, empty: true, earliestAllowed: earliest };
  return { range: { ...range, from: earliest }, clamped: true, empty: false, earliestAllowed: earliest };
}

/** The equally long period immediately before `range`, for period-over-period comparison. */
export function previousPeriod(range: DateRange): DateRange {
  const len = diffDays(range.from, range.to) + 1;
  return { preset: "custom", from: addDays(range.from, -len), to: addDays(range.from, -1) };
}

export function describeRange(r: DateRange): string {
  return r.from === r.to ? r.from : `${r.from} → ${r.to}`;
}
