// CSV exports. Built from the same scoped report services the UI uses, so exports can never
// include creators, accounts, dates or metrics the viewer cannot already see. Every export is
// audited with its filters and row count.
import { requirePermission, type AccessContext } from "@/lib/access/context";
import { audit, type AuditActor } from "@/lib/audit";
import { METRICS } from "@/lib/metrics/catalog";
import type { MetricMap } from "@/lib/metrics/compute";
import { ValidationError } from "@/lib/errors";
import { getCampaignReport, getCreatives, listCreators, type AdRowView, type SearchParamsInput } from "./service";
import { searchParamsToObject } from "./filters";

export const EXPORT_KINDS = ["creators", "creatives", "campaigns"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
const MAX_ROWS = 10_000;
const PAGE = 200;

/** Neutralise spreadsheet formula injection and quote per RFC 4180. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : "") : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function metricCells(metrics: MetricMap, keys: string[]): string[] {
  return keys.map((k) => {
    const m = metrics[k];
    return m && m.s === "ok" ? csvCell(m.v) : "";
  });
}

function withPage(sp: SearchParamsInput, page: number): URLSearchParams {
  const obj = searchParamsToObject(sp);
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) out.set(k, v.join(","));
    else if (v !== undefined) out.set(k, String(v));
  }
  // Leaderboard ranking thresholds don't apply to exports unless explicitly requested.
  if (!out.has("minSpend")) out.set("minSpend", "0");
  if (!out.has("minPurchases")) out.set("minPurchases", "0");
  out.set("page", String(page));
  out.set("pageSize", String(PAGE));
  return out;
}

export async function buildExport(ctx: AccessContext, actor: AuditActor, kind: ExportKind, sp: SearchParamsInput) {
  requirePermission(ctx, "reports.export");
  if (!EXPORT_KINDS.includes(kind)) throw new ValidationError("Unknown export type");
  const metricKeys = METRICS.map((m) => m.key).filter((k) => ctx.metrics.has(k));
  const metricHeaders = metricKeys.map((k) => METRICS.find((m) => m.key === k)!.label);
  const lines: string[] = [];
  let range: { from: string; to: string; currency: string; demo: boolean } | null = null;
  let rows = 0;

  for (let page = 1; rows < MAX_ROWS; page++) {
    const q = withPage(sp, page);
    if (kind === "creators") {
      const r = await listCreators(ctx, q);
      range ??= r.range;
      if (page === 1) lines.push(["Creator ID", "Creator", "Instagram", "Active", "Date from", "Date to", "Currency", ...metricHeaders].map(csvCell).join(","));
      for (const c of r.rows) {
        lines.push([c.code, c.name, c.instagramHandle ?? "", c.isActive ? "yes" : "no", r.range.from, r.range.to, r.range.currency].map(csvCell).concat(metricCells(c.metrics, metricKeys)).join(","));
      }
      rows += r.rows.length;
      if (r.rows.length < PAGE) break;
    } else if (kind === "creatives") {
      const r = await getCreatives(ctx, q, "ad");
      range ??= r.range;
      if (page === 1) lines.push(["Meta ad ID", "Ad name", "Creator ID", "Creator", "Asset", "Product", "Type", "Campaign", "Ad set", "Attribution", "Low sample", "Date from", "Date to", "Currency", ...metricHeaders].map(csvCell).join(","));
      for (const a of r.rows as AdRowView[]) {
        lines.push([a.metaAdId, a.name, a.creator?.code ?? "", a.creator?.name ?? "Unmapped", a.asset?.title ?? "", a.asset?.product ?? "", a.creativeType, a.campaign?.name ?? "", a.adSet?.name ?? "", a.adSet?.attribution ?? "", a.sample.low ? "yes" : "no", r.range.from, r.range.to, r.range.currency].map(csvCell).concat(metricCells(a.metrics, metricKeys)).join(","));
      }
      rows += r.rows.length;
      if (r.rows.length < PAGE) break;
    } else {
      const r = await getCampaignReport(ctx, q, "campaign");
      range ??= r.range;
      if (page === 1) lines.push(["Campaign", "Objective", "Status", "Account", "Date from", "Date to", "Currency", ...metricHeaders].map(csvCell).join(","));
      for (const c of r.rows as { name: string; objective: string | null; status: string | null; account: string | null; metrics: MetricMap }[]) {
        lines.push([c.name, c.objective ?? "", c.status ?? "", c.account ?? "", r.range.from, r.range.to, r.range.currency].map(csvCell).concat(metricCells(c.metrics, metricKeys)).join(","));
      }
      rows += r.rows.length;
      if (r.rows.length < PAGE) break;
    }
  }

  await audit(actor, "export.csv", `Exported ${rows} ${kind} row(s) to CSV`, {
    targetType: "export",
    metadata: { kind, rows, filters: searchParamsToObject(sp) as never, metrics: metricKeys, range: range as never },
  });
  const demoNote = range?.demo ? "-DEMO" : "";
  const filename = `suroskie-${kind}-${range?.from ?? "na"}-to-${range?.to ?? "na"}${demoNote}.csv`;
  // BOM so Excel opens UTF-8 (₹, non-Latin creator names) correctly.
  return { filename, body: "﻿" + lines.join("\r\n") + "\r\n", rows };
}
