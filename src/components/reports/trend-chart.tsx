"use client";

import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { METRIC_BY_KEY } from "@/lib/metrics/catalog";
import type { MetricMap } from "@/lib/metrics/compute";
import { formatByUnit, formatDateLabel } from "@/lib/metrics/format";

export interface TrendPoint {
  date: string;
  grain: string;
  metrics: MetricMap;
}

const NONE = "__none__";

export function TrendChart({ data, metricKeys, defaultPrimary, defaultSecondary, currency, height = 280 }: { data: TrendPoint[]; metricKeys: string[]; defaultPrimary: string; defaultSecondary?: string; currency: string; height?: number }) {
  const [primary, setPrimary] = useState(metricKeys.includes(defaultPrimary) ? defaultPrimary : metricKeys[0]);
  const [secondary, setSecondary] = useState(defaultSecondary && metricKeys.includes(defaultSecondary) ? defaultSecondary : NONE);

  const rows = useMemo(
    () =>
      data.map((p) => {
        const v = (k: string) => {
          const m = p.metrics[k];
          return m && m.s === "ok" ? m.v : null; // gaps, never fake zeros
        };
        return { date: p.date, a: primary ? v(primary) : null, b: secondary !== NONE ? v(secondary) : null };
      }),
    [data, primary, secondary],
  );

  if (!metricKeys.length) return <p className="py-10 text-center text-sm text-muted-foreground">No chartable metrics are enabled for your account.</p>;
  if (!data.length) return <p className="py-10 text-center text-sm text-muted-foreground">No synced data for this date range.</p>;

  const unitA = METRIC_BY_KEY[primary]?.unit ?? "COUNT";
  const unitB = METRIC_BY_KEY[secondary]?.unit ?? "COUNT";
  const grain = data[0]?.grain === "week" ? "Weekly" : "Daily";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{grain} trend</span>
        <Select value={primary} onValueChange={setPrimary}>
          <SelectTrigger className="h-8 w-[200px]" aria-label="Primary metric">
            <span className="mr-1 inline-block size-2 rounded-full bg-chart-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {metricKeys.map((k) => (
              <SelectItem key={k} value={k}>{METRIC_BY_KEY[k]?.label ?? k}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={secondary} onValueChange={setSecondary}>
          <SelectTrigger className="h-8 w-[200px]" aria-label="Secondary metric">
            <span className="mr-1 inline-block size-2 rounded-full bg-chart-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No second metric</SelectItem>
            {metricKeys.filter((k) => k !== primary).map((k) => (
              <SelectItem key={k} value={k}>{METRIC_BY_KEY[k]?.label ?? k}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="fillA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} minTickGap={24} tickFormatter={(d: string) => formatDateLabel(d).replace(/ \d{4}$/, "")} stroke="var(--muted-foreground)" />
            <YAxis yAxisId="a" tickLine={false} axisLine={false} fontSize={11} width={64} tickFormatter={(v: number) => formatByUnit(v, unitA, currency, true)} stroke="var(--muted-foreground)" />
            {secondary !== NONE && (
              <YAxis yAxisId="b" orientation="right" tickLine={false} axisLine={false} fontSize={11} width={64} tickFormatter={(v: number) => formatByUnit(v, unitB, currency, true)} stroke="var(--muted-foreground)" />
            )}
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
              labelFormatter={(d) => formatDateLabel(String(d))}
              formatter={(value, name) => {
                const key = name === "a" ? primary : secondary;
                const def = METRIC_BY_KEY[key];
                return [value === null || value === undefined ? "—" : formatByUnit(Number(value), def?.unit ?? "COUNT", currency), def?.label ?? key];
              }}
            />
            <Area yAxisId="a" type="monotone" dataKey="a" stroke="var(--chart-1)" strokeWidth={2} fill="url(#fillA)" connectNulls={false} isAnimationActive={false} />
            {secondary !== NONE && <Line yAxisId="b" type="monotone" dataKey="b" stroke="var(--chart-2)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
