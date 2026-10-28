import { CalendarRange, Info } from "lucide-react";
import type { RangeMeta } from "@/lib/reporting/service";
import { formatDateLabel } from "@/lib/metrics/format";

export function RangeNote({ range, attribution }: { range: RangeMeta; attribution?: string }) {
  const tzMismatch = range.accountTimezones.some((t) => t !== range.reportingTimezone);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <CalendarRange className="size-3.5" />
        {formatDateLabel(range.from)}
        {range.from !== range.to && <> – {formatDateLabel(range.to)}</>}
      </span>
      <span>Time zone: {range.reportingTimezone}{tzMismatch ? ` (Meta reports days in account time: ${range.accountTimezones.join(", ")})` : ""}</span>
      <span>Currency: {range.currency}</span>
      <span>Attribution: {attribution ?? "each ad set's Meta attribution setting"}</span>
      {range.clamped && !range.empty && (
        <span className="inline-flex items-center gap-1 text-amber-700">
          <Info className="size-3.5" /> Limited to your authorised date range (from {range.earliestAllowed})
        </span>
      )}
    </div>
  );
}

export function EmptyRangeNotice({ range }: { range: RangeMeta }) {
  if (!range.empty) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      The selected dates are outside the range you are authorised to view (data from {range.earliestAllowed} onwards). Choose a more recent range.
    </div>
  );
}

export function AttributionDisclaimer() {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      Figures are Meta-attributed results using each ad set&apos;s attribution setting. Attributed purchases are not unique customers and attributed
      value is not necessarily incremental revenue. Rankings show what Meta credited to each creative, not proof that a creator caused those sales.
    </p>
  );
}
