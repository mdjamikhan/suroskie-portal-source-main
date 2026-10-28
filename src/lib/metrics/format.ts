// Client-safe formatting helpers. Indian digit grouping (en-IN) and INR by default.
import { METRIC_BY_KEY, type MetricUnit } from "./catalog";
import type { MetricValue } from "./compute";

const LOCALE = "en-IN";

export function formatCurrency(v: number, currency = "INR", compact = false): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : Math.abs(v) >= 1000 ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(v);
}

export function formatNumber(v: number, compact = false, maxFrac = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : maxFrac,
  }).format(v);
}

export function formatByUnit(v: number, unit: MetricUnit, currency = "INR", compact = false): string {
  switch (unit) {
    case "CURRENCY":
      return formatCurrency(v, currency, compact);
    case "PERCENT":
      return `${formatNumber(v, false, 2)}%`;
    case "RATIO":
      return `${formatNumber(v, false, 2)}×`;
    case "SECONDS":
      return `${formatNumber(v, false, 1)}s`;
    default:
      return formatNumber(v, compact, Number.isInteger(v) ? 0 : 1);
  }
}

export interface FormattedMetric {
  text: string;
  state: MetricValue["s"];
  /** Tooltip explaining why a value is missing or approximate. */
  hint?: string;
}

export function formatMetric(key: string, mv: MetricValue | undefined, currency = "INR", compact = false): FormattedMetric {
  const def = METRIC_BY_KEY[key];
  if (!mv) return { text: "—", state: "unavailable", hint: "Not available" };
  switch (mv.s) {
    case "ok": {
      const text = formatByUnit(mv.v, def?.unit ?? "COUNT", currency, compact);
      if (mv.approx === "upper_bound") return { text: `≤ ${text}`, state: "ok", hint: "Upper bound: summed daily reach over-counts people reached on several days or by several ads." };
      if (mv.approx === "lower_bound") return { text: `≥ ${text}`, state: "ok", hint: "Lower bound: computed from summed daily reach." };
      if (mv.approx === "estimate") return { text: `~${text}`, state: "ok", hint: "Estimate: play-weighted average of Meta's daily averages." };
      return { text, state: "ok" };
    }
    case "not_applicable":
      return { text: "n/a", state: mv.s, hint: mv.reason };
    case "unavailable":
      return { text: "—", state: mv.s, hint: mv.reason };
    case "missing":
      return { text: "No data", state: mv.s, hint: mv.reason };
  }
}

export function formatDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string | Date | null | undefined, timeZone = "Asia/Kolkata"): string {
  if (!iso) return "Never";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString(LOCALE, { timeZone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(iso: string | Date | null | undefined): string {
  if (!iso) return "never";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
