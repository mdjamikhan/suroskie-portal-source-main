"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { AppSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS: { key: keyof AppSettings; label: string; hint: string; type: "text" | "number" }[] = [
  { key: "reportingTimezone", label: "Reporting time zone", hint: "IANA name. Defines “today”, “yesterday” and presets.", type: "text" },
  { key: "recentRefreshDays", label: "Hourly refresh window (days)", hint: "Recent days re-fetched every hour.", type: "number" },
  { key: "attributionRefreshDays", label: "Daily attribution refresh (days)", hint: "Days re-fetched daily to capture late conversions (default 28).", type: "number" },
  { key: "backfillMonths", label: "Historical import depth (months)", hint: "Up to 37 — Meta's insights retention.", type: "number" },
  { key: "breakdownDays", label: "Breakdown history (days)", hint: "Age, gender, placement, device, geography.", type: "number" },
  { key: "minSpendForRanking", label: "Leaderboard minimum spend", hint: "In account currency.", type: "number" },
  { key: "minPurchasesForRanking", label: "Leaderboard minimum purchases", hint: "For ROAS and cost-per-purchase rankings.", type: "number" },
  { key: "minImpressionsForRanking", label: "Low-sample impressions threshold", hint: "Below this a result is flagged as low sample.", type: "number" },
  { key: "staleAfterHours", label: "Stale data warning (hours)", hint: "Flag data as stale after this long without a successful sync.", type: "number" },
];

export function SettingsForm({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const body = Object.fromEntries(FIELDS.map((f) => [f.key, f.type === "number" ? Number(fd.get(f.key)) : String(fd.get(f.key))]));
        setSaving(true);
        try {
          await api("/api/v1/admin/settings", { method: "PATCH", body });
          toast.success("Settings saved");
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1">
          <Label htmlFor={f.key}>{f.label}</Label>
          <Input id={f.key} name={f.key} type={f.type} step="any" defaultValue={String(initial[f.key])} required />
          <p className="text-xs text-muted-foreground">{f.hint}</p>
        </div>
      ))}
      <div className="md:col-span-2 xl:col-span-3"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button></div>
    </form>
  );
}

export function ResetMetricButton({ k }: { k: string }) {
  const router = useRouter();
  return (
    <Button size="sm" variant="ghost" onClick={async () => {
      try { await api("/api/v1/admin/metrics", { method: "PATCH", body: { key: k, isSupported: true } }); toast.success("Metric re-enabled; the next sync re-checks it"); router.refresh(); } catch (e) { toast.error((e as Error).message); }
    }}>Re-check</Button>
  );
}
