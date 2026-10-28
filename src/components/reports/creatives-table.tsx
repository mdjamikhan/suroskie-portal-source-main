import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { METRIC_BY_KEY } from "@/lib/metrics/catalog";
import type { AdRowView } from "@/lib/reporting/service";
import { SORTABLE_METRICS } from "@/lib/metrics/sortable";
import { Thumb } from "./thumb";

export { Thumb };
import { hrefWith, type SP } from "@/lib/url";
import { MetricValue } from "./metric-value";
import { LowSampleBadge, StatusDot } from "./badges";

export function SortHeader({ k, sort, dir, path, sp, align = "right" }: { k: string; sort: string; dir: string; path: string; sp: SP; align?: "left" | "right" }) {
  const label = METRIC_BY_KEY[k]?.label ?? k;
  if (!SORTABLE_METRICS.includes(k)) return <span>{label}</span>;
  const active = sort === k;
  const defaultDir = METRIC_BY_KEY[k]?.higherIsBetter === false ? "asc" : "desc";
  const nextDir = active ? (dir === "desc" ? "asc" : "desc") : defaultDir;
  return (
    <Link href={hrefWith(path, sp, { sort: k, dir: nextDir, page: null })} scroll={false} className={`inline-flex items-center gap-1 hover:text-foreground ${align === "right" ? "justify-end" : ""} ${active ? "text-foreground" : ""}`}>
      {label}
      {active && (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
    </Link>
  );
}

export function CreativesTable({
  rows, metricKeys, currency, sort, dir, path, sp, showCreator = true, compareSelectable = false, emptyText = "No creatives with delivery in this date range.",
}: {
  rows: AdRowView[];
  metricKeys: string[];
  currency: string;
  sort: string;
  dir: string;
  path: string;
  sp: SP;
  showCreator?: boolean;
  compareSelectable?: boolean;
  emptyText?: string;
}) {
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {compareSelectable && <TableHead className="w-8"><span className="sr-only">Compare</span></TableHead>}
            <TableHead className="min-w-[280px]">Creative</TableHead>
            {showCreator && <TableHead>Creator</TableHead>}
            {metricKeys.map((k) => (
              <TableHead key={k} className="text-right whitespace-nowrap">
                <SortHeader k={k} sort={sort} dir={dir} path={path} sp={sp} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              {compareSelectable && (
                <TableCell>
                  <input type="checkbox" name="ids" value={r.id} form="compare-form" aria-label={`Compare ${r.name}`} className="size-4 accent-[var(--primary)]" />
                </TableCell>
              )}
              <TableCell>
                <div className="flex items-center gap-3">
                  <Thumb url={r.thumbnailUrl} type={r.creativeType} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="max-w-[320px] truncate font-medium" title={r.name}>{r.name}</p>
                      {r.previewUrl && (
                        <a href={r.previewUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open Meta ad preview">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <StatusDot status={r.status} />
                      <span className="max-w-[220px] truncate" title={r.campaign?.name}>{r.campaign?.name}</span>
                      {r.asset?.product && <span>· {r.asset.product}</span>}
                      {r.adSet?.attribution && <span>· {r.adSet.attribution}</span>}
                      {r.sample.low && <LowSampleBadge reasons={r.sample.reasons} />}
                    </div>
                  </div>
                </div>
              </TableCell>
              {showCreator && (
                <TableCell className="whitespace-nowrap">
                  {r.creator ? (
                    <Link className="hover:underline" href={`/creators/${r.creator.id}`}>{r.creator.name}</Link>
                  ) : (
                    <span className="text-xs text-amber-700">Unmapped</span>
                  )}
                </TableCell>
              )}
              {metricKeys.map((k) => (
                <TableCell key={k} className="text-right">
                  <MetricValue k={k} v={r.metrics[k]} currency={currency} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, path, sp }: { page: number; pageSize: number; total: number; path: string; sp: SP }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="text-xs text-muted-foreground">{total.toLocaleString("en-IN")} result{total === 1 ? "" : "s"}</p>;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Page {page} of {pages} · {total.toLocaleString("en-IN")} results
      </p>
      <div className="flex gap-2">
        {page > 1 ? <Link className="rounded-md border px-3 py-1.5 hover:bg-muted" href={hrefWith(path, sp, { page: page - 1 })} scroll={false}>Previous</Link> : <span className="rounded-md border px-3 py-1.5 opacity-40">Previous</span>}
        {page < pages ? <Link className="rounded-md border px-3 py-1.5 hover:bg-muted" href={hrefWith(path, sp, { page: page + 1 })} scroll={false}>Next</Link> : <span className="rounded-md border px-3 py-1.5 opacity-40">Next</span>}
      </div>
    </div>
  );
}
