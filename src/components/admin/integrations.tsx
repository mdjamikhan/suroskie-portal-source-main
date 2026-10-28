"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConnectTokenForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      autoComplete="off"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        setBusy(true);
        try {
          const r = await api<{ discoveredAccounts: number }>("/api/v1/admin/meta/connections", { body: { label: fd.get("label"), accessToken: fd.get("accessToken") } });
          form.reset(); // clear the token from the page immediately
          toast.success(`Connected. ${r.discoveredAccounts} ad account(s) found — enable the ones to sync below.`);
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <div className="space-y-1"><Label htmlFor="label">Label</Label><Input id="label" name="label" defaultValue="Suroskie system user" required /></div>
        <div className="space-y-1">
          <Label htmlFor="accessToken">System user access token</Label>
          <Input id="accessToken" name="accessToken" type="password" required autoComplete="off" spellCheck={false} placeholder="Paste once — it is encrypted and never shown again" />
        </div>
      </div>
      <Button type="submit" disabled={disabled || busy}>{busy ? "Validating with Meta…" : "Validate & connect"}</Button>
    </form>
  );
}

export function ConnectionActions({ id, isDemo }: { id: string; isDemo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (isDemo) return <span className="text-xs text-muted-foreground">Synthetic</span>;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => api(`/api/v1/admin/meta/connections/${id}`, { body: { action: "validate" } }), "Connection checked")}>Re-validate</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => api(`/api/v1/admin/meta/connections/${id}`, { body: { action: "discover" } }), "Ad accounts refreshed")}>Discover accounts</Button>
      <Button size="sm" variant="destructive" disabled={busy} onClick={() => confirm("Disconnect? The encrypted token is deleted and syncing stops. Historical data is kept.") && run(() => api(`/api/v1/admin/meta/connections/${id}`, { method: "DELETE" }), "Disconnected")}>Disconnect</Button>
    </div>
  );
}
