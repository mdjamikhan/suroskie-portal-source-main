"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PRESET_LABELS, PRESETS } from "@/lib/reporting/date-range";

const ALL = "__all__";
const TYPES = [
  ["VIDEO", "Video"],
  ["IMAGE", "Image"],
  ["CAROUSEL", "Carousel"],
  ["OTHER", "Other"],
] as const;

export interface FilterOptions {
  accounts?: { id: string; name: string }[];
  campaigns?: { id: string; name: string }[];
  products?: string[];
  creators?: { id: string; name: string }[];
  showType?: boolean;
  showCompare?: boolean;
}

export function FilterBar({ accounts, campaigns, products, creators, showType, showCompare }: FilterOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const range = sp.get("range") ?? "last_30d";
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === ALL) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const select = (key: string, label: string, options: { value: string; label: string }[]) => (
    <div className="flex min-w-0 flex-col gap-1">
      <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Select value={sp.get(key) ?? ALL} onValueChange={(v) => update({ [key]: v })}>
        <SelectTrigger className="h-9 w-full min-w-[150px] bg-background sm:w-[190px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const hasFilters = ["account", "campaign", "product", "type", "creator"].some((k) => sp.get(k));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Date range</Label>
        <Select
          value={range}
          onValueChange={(v) => {
            if (v === "custom") update({ range: "custom", from: from || null, to: to || null });
            else update({ range: v, from: null, to: null });
          }}
        >
          <SelectTrigger className="h-9 w-[170px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {PRESET_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {range === "custom" && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) update({ range: "custom", from, to });
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="from" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">From</Label>
            <Input id="from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px] bg-background" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="to" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">To</Label>
            <Input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px] bg-background" />
          </div>
          <Button type="submit" size="sm" className="h-9" disabled={!from || !to}>
            Apply
          </Button>
        </form>
      )}
      {accounts && accounts.length > 1 && select("account", "Ad account", accounts.map((a) => ({ value: a.id, label: a.name })))}
      {campaigns && campaigns.length > 0 && select("campaign", "Campaign", campaigns.map((c) => ({ value: c.id, label: c.name })))}
      {creators && creators.length > 0 && select("creator", "Creator", creators.map((c) => ({ value: c.id, label: c.name })))}
      {products && products.length > 0 && select("product", "Product", products.map((p) => ({ value: p, label: p })))}
      {showType && select("type", "Creative type", TYPES.map(([value, label]) => ({ value, label })))}
      {showCompare && (
        <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-3">
          <Switch id="compare" checked={sp.get("compare") === "1"} onCheckedChange={(c) => update({ compare: c ? "1" : null })} />
          <Label htmlFor="compare" className="text-sm">Compare to previous period</Label>
        </div>
      )}
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-9" onClick={() => update({ account: null, campaign: null, product: null, type: null, creator: null })}>
          <RotateCcw className="size-3.5" /> Reset
        </Button>
      )}
      {pending && <Loader2 className="mb-2 size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
    </div>
  );
}
