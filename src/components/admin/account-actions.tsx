"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SyncToggle({ id, enabled, disabled }: { id: string; enabled: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  return (
    <Switch
      checked={on}
      disabled={disabled}
      aria-label="Sync this ad account"
      onCheckedChange={async (v) => {
        setOn(v);
        try {
          await api(`/api/v1/admin/ad-accounts/${id}`, { method: "PATCH", body: { syncEnabled: v } });
          toast.success(v ? "Sync enabled — historical import will start on the next scheduler run" : "Sync disabled; queued jobs cancelled");
          router.refresh();
        } catch (e) {
          setOn(!v);
          toast.error((e as Error).message);
        }
      }}
    />
  );
}

export function SyncNowButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  async function go(range?: { from: string; to: string }) {
    setBusy(true);
    try {
      const r = await api<{ enqueued: number; alreadyQueued: number }>(`/api/v1/admin/ad-accounts/${id}/sync`, { body: range ?? {} });
      toast.success(`Sync queued: ${r.enqueued} job(s)${r.alreadyQueued ? `, ${r.alreadyQueued} already in progress` : ""}. Processing has started.`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" disabled={disabled || busy} onClick={() => go()}>
        <RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} /> Sync now
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" disabled={disabled || busy}>Resync range…</Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-3">
          <p className="text-sm font-medium">Re-import a historical range</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor={`f-${id}`}>From</Label><Input id={`f-${id}`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor={`t-${id}`}>To</Label><Input id={`t-${id}`} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <Button size="sm" className="w-full" disabled={!from || !to || busy} onClick={() => go({ from, to })}>Queue resync</Button>
          <p className="text-xs text-muted-foreground">Rows are upserted by ad and date, so resyncing never duplicates data.</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
