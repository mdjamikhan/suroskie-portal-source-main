import { AlertTriangle, CheckCircle2, Clock, FlaskConical } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, relativeTime } from "@/lib/metrics/format";
import { cn } from "@/lib/utils";

export function SyncBadge({ lastSuccessfulSyncAt, stale, failing, demo, timeZone }: { lastSuccessfulSyncAt: string | null; stale: boolean; failing: boolean; demo: boolean; timeZone: string }) {
  if (demo) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
        <FlaskConical className="size-3.5" /> Demo data — not from Meta
      </span>
    );
  }
  const Icon = failing ? AlertTriangle : stale ? Clock : CheckCircle2;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            failing ? "border-red-200 bg-red-50 text-red-700" : stale ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          <Icon className="size-3.5" />
          {lastSuccessfulSyncAt ? `Synced ${relativeTime(lastSuccessfulSyncAt)}` : "Not synced yet"}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Last successful Meta sync: {formatDateTime(lastSuccessfulSyncAt, timeZone)}
        {failing ? " · one or more accounts are failing to sync" : stale ? " · data may be out of date" : ""}
      </TooltipContent>
    </Tooltip>
  );
}

export function LowSampleBadge({ reasons }: { reasons: string[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
          <AlertTriangle className="size-3" /> Low sample
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">Results are not conclusive: {reasons.join("; ")}.</TooltipContent>
    </Tooltip>
  );
}

export function StatusDot({ status }: { status: string | null }) {
  const s = (status ?? "UNKNOWN").toUpperCase();
  const color = s === "ACTIVE" ? "bg-emerald-500" : s.includes("PAUSED") ? "bg-slate-400" : s.includes("DISAPPROVED") || s.includes("ISSUES") ? "bg-red-500" : "bg-slate-300";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", color)} />
      {s.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}
