import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { METRIC_BY_KEY } from "@/lib/metrics/catalog";
import type { MetricValue as MV } from "@/lib/metrics/compute";
import { percentChange } from "@/lib/metrics/compute";
import { formatMetric } from "@/lib/metrics/format";
import { cn } from "@/lib/utils";

export function MetricValue({ k, v, currency, compact, className }: { k: string; v: MV | undefined; currency: string; compact?: boolean; className?: string }) {
  const f = formatMetric(k, v, currency, compact);
  const muted = f.state !== "ok";
  const node = <span className={cn("tabular whitespace-nowrap", muted && "text-muted-foreground", className)}>{f.text}</span>;
  if (!f.hint) return node;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-4">{node}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{f.hint}</TooltipContent>
    </Tooltip>
  );
}

export function Delta({ k, current, previous }: { k: string; current: MV | undefined; previous: MV | undefined }) {
  const pct = percentChange(current, previous);
  if (pct === null) return <span className="text-xs text-muted-foreground">no comparison</span>;
  const good = (pct >= 0) === (METRIC_BY_KEY[k]?.higherIsBetter ?? true);
  const Icon = pct >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular", Math.abs(pct) < 0.5 ? "text-muted-foreground" : good ? "text-positive" : "text-negative")}>
      <Icon className="size-3.5" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function KpiCard({ k, v, prev, currency, showDelta }: { k: string; v: MV | undefined; prev?: MV | undefined; currency: string; showDelta?: boolean }) {
  const def = METRIC_BY_KEY[k];
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground">{def?.label ?? k}</p>
        <Tooltip>
          <TooltipTrigger aria-label={`About ${def?.label ?? k}`}>
            <Info className="size-3.5 text-muted-foreground/60" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {def?.description}
            {def?.formula ? <span className="mt-1 block font-mono text-[11px] opacity-80">{def.formula}</span> : null}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">
        <MetricValue k={k} v={v} currency={currency} />
      </div>
      {showDelta && (
        <div className="mt-1 flex items-center gap-1.5">
          <Delta k={k} current={v} previous={prev} />
          <span className="text-[11px] text-muted-foreground">vs previous period</span>
        </div>
      )}
    </div>
  );
}
