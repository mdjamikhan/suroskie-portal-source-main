"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { METRICS, inferableHiddenMetrics } from "@/lib/metrics/catalog";
import { PERMISSIONS, PERMISSION_KEYS, SUPER_ADMIN_ROLE, type PermissionKey } from "@/lib/access/permissions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface RoleOption {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  metrics: string[];
  allAdAccounts: boolean;
  allCreators: boolean;
  maxLookbackDays: number | null;
}

export interface AccessValue {
  roleIds: string[];
  adAccountIds: string[];
  creatorIds: string[];
  allAdAccounts: boolean | null;
  allCreators: boolean | null;
  maxLookbackDays: number | null;
  earliestDataDate: string | null;
  permissionOverrides: { key: string; granted: boolean }[];
  metricOverrides: { key: string; granted: boolean }[];
}

type Tri = "inherit" | "allow" | "deny";

function TriToggle({ value, onChange, label }: { value: Tri; onChange: (v: Tri) => void; label: string }) {
  return (
    <div className="inline-flex rounded-md border p-0.5 text-[11px]" role="radiogroup" aria-label={label}>
      {(["inherit", "allow", "deny"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn("rounded px-2 py-0.5 capitalize", value === v ? (v === "allow" ? "bg-emerald-600 text-white" : v === "deny" ? "bg-red-600 text-white" : "bg-muted text-foreground") : "text-muted-foreground")}
        >
          {v === "inherit" ? "Role" : v}
        </button>
      ))}
    </div>
  );
}

export function AccessEditor({
  mode, userId, initial, roles, accounts, creators,
}: {
  mode: "invite" | "edit";
  userId?: string;
  initial: AccessValue;
  roles: RoleOption[];
  accounts: { id: string; name: string }[];
  creators: { id: string; name: string; code: string }[];
}) {
  const router = useRouter();
  const [v, setV] = useState<AccessValue>(initial);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatorFilter, setCreatorFilter] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const selectedRoles = roles.filter((r) => v.roleIds.includes(r.id));
  const isSuper = selectedRoles.some((r) => r.key === SUPER_ADMIN_ROLE);
  const roleMetrics = new Set(selectedRoles.flatMap((r) => r.metrics));
  const rolePerms = new Set(selectedRoles.flatMap((r) => r.permissions));
  const ov = (list: { key: string; granted: boolean }[], key: string): Tri => {
    const o = list.find((x) => x.key === key);
    return !o ? "inherit" : o.granted ? "allow" : "deny";
  };
  const setOv = (field: "metricOverrides" | "permissionOverrides", key: string, t: Tri) =>
    setV((s) => ({ ...s, [field]: [...s[field].filter((x) => x.key !== key), ...(t === "inherit" ? [] : [{ key, granted: t === "allow" }])] }));

  const effectiveMetrics = new Set<string>(isSuper ? METRICS.map((m) => m.key) : roleMetrics);
  const effectivePerms = new Set<string>(isSuper ? PERMISSION_KEYS : rolePerms);
  if (!isSuper) {
    for (const o of v.metricOverrides) {
      if (o.granted) effectiveMetrics.add(o.key);
      else effectiveMetrics.delete(o.key);
    }
    for (const o of v.permissionOverrides) {
      if (o.granted) effectivePerms.add(o.key);
      else effectivePerms.delete(o.key);
    }
  }
  const roleAllAccounts = selectedRoles.some((r) => r.allAdAccounts);
  const roleAllCreators = selectedRoles.some((r) => r.allCreators);
  const allAccounts = v.allAdAccounts ?? roleAllAccounts;
  const allCreators = v.allCreators ?? roleAllCreators;
  const inferable = inferableHiddenMetrics(effectiveMetrics);
  const exportTri = ov(v.permissionOverrides, "reports.export");

  async function save() {
    setSaving(true);
    try {
      if (mode === "invite") {
        const r = await api<{ userId: string; delivered: boolean; inviteUrl: string | null }>("/api/v1/admin/users", { body: { ...v, email, name } });
        if (r.inviteUrl) {
          setInviteLink(r.inviteUrl);
          toast.success("User created. Email isn't configured, so copy the invitation link below.");
        } else {
          toast.success(`Invitation emailed to ${email}`);
          router.push(`/users/${r.userId}`);
        }
      } else {
        await api(`/api/v1/admin/users/${userId}`, { method: "PATCH", body: v });
        toast.success("Access updated. It applies from the user's next request.");
        router.refresh();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const visibleCreators = creators.filter((c) => !creatorFilter || `${c.name} ${c.code}`.toLowerCase().includes(creatorFilter.toLowerCase()));

  return (
    <div className="space-y-6">
      {mode === "invite" && (
        <section className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label htmlFor="name">Name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        </section>
      )}

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">1 · Role</h2>
        <p className="mb-3 text-xs text-muted-foreground">Roles give a starting set of permissions, metrics and data scope. Fine-tune below.</p>
        <div className="grid gap-2 md:grid-cols-2">
          {roles.map((r) => (
            <label key={r.id} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", v.roleIds.includes(r.id) && "border-primary bg-accent/50")}>
              <Checkbox checked={v.roleIds.includes(r.id)} onCheckedChange={(c) => setV((s) => ({ ...s, roleIds: c ? [...s.roleIds, r.id] : s.roleIds.filter((x) => x !== r.id) }))} />
              <div>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.description}</p>
              </div>
            </label>
          ))}
        </div>
        {isSuper && <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900">Super Admins always have full access; the settings below are ignored for them.</p>}
      </section>

      <section className={cn("grid gap-6 lg:grid-cols-2", isSuper && "pointer-events-none opacity-50")}>
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">2 · Ad accounts</h2>
          <ScopePicker label="ad accounts" value={v.allAdAccounts} roleAll={roleAllAccounts} onChange={(x) => setV((s) => ({ ...s, allAdAccounts: x }))} />
          {!allAccounts && (
            <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {accounts.length === 0 && <p className="p-2 text-xs text-muted-foreground">No ad accounts connected yet.</p>}
              {accounts.map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                  <Checkbox checked={v.adAccountIds.includes(a.id)} onCheckedChange={(c) => setV((s) => ({ ...s, adAccountIds: c ? [...s.adAccountIds, a.id] : s.adAccountIds.filter((x) => x !== a.id) }))} />
                  {a.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">3 · Creators</h2>
          <ScopePicker label="creators" value={v.allCreators} roleAll={roleAllCreators} onChange={(x) => setV((s) => ({ ...s, allCreators: x }))} />
          {!allCreators && (
            <>
              <Input className="mt-3 h-8" placeholder="Filter creators" value={creatorFilter} onChange={(e) => setCreatorFilter(e.target.value)} />
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {visibleCreators.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                    <Checkbox checked={v.creatorIds.includes(c.id)} onCheckedChange={(ch) => setV((s) => ({ ...s, creatorIds: ch ? [...s.creatorIds, c.id] : s.creatorIds.filter((x) => x !== c.id) }))} />
                    {c.name} <span className="text-xs text-muted-foreground">{c.code}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{v.creatorIds.length} creator(s) selected. With selected creators, unmapped ads are never visible.</p>
            </>
          )}
        </div>
      </section>

      <section className={cn("rounded-xl border bg-card p-5", isSuper && "pointer-events-none opacity-50")}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">4 · Metrics</h2>
            <p className="text-xs text-muted-foreground">“Role” uses the role default. Hidden metrics are removed on the server — from pages, APIs and exports.</p>
          </div>
          <p className="text-xs text-muted-foreground">{effectiveMetrics.size} of {METRICS.length} visible</p>
        </div>
        {inferable.length > 0 && (
          <p className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900"><AlertTriangle className="size-3.5" /> Hidden but derivable from visible metrics: {inferable.join("; ")}.</p>
        )}
        <div className="mt-3 grid gap-x-6 gap-y-1 md:grid-cols-2">
          {METRICS.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/60">
              <div className="min-w-0">
                <span className={cn("text-sm", effectiveMetrics.has(m.key) ? "" : "text-muted-foreground line-through")}>{m.label}</span>
                {m.sensitive && <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-600">sensitive</span>}
              </div>
              <TriToggle label={m.label} value={ov(v.metricOverrides, m.key)} onChange={(t) => setOv("metricOverrides", m.key, t)} />
            </div>
          ))}
        </div>
      </section>

      <section className={cn("grid gap-6 lg:grid-cols-2", isSuper && "pointer-events-none opacity-50")}>
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">5 · Reports, dates & exports</h2>
          <div className="mt-3 flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">CSV export</p>
              <p className="text-xs text-muted-foreground">Currently {effectivePerms.has("reports.export") ? "allowed" : "not allowed"}.</p>
            </div>
            <TriToggle label="CSV export" value={exportTri} onChange={(t) => setOv("permissionOverrides", "reports.export", t)} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lookback">Max look-back (days)</Label>
              <Input id="lookback" type="number" min={0} max={3650} placeholder={`Role default${selectedRoles.length ? ` (${selectedRoles.some((r) => r.maxLookbackDays === null) ? "unlimited" : Math.max(...selectedRoles.map((r) => r.maxLookbackDays ?? 0))})` : ""}`} value={v.maxLookbackDays ?? ""} onChange={(e) => setV((s) => ({ ...s, maxLookbackDays: e.target.value === "" ? null : Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="earliest">No data before</Label>
              <Input id="earliest" type="date" value={v.earliestDataDate ?? ""} onChange={(e) => setV((s) => ({ ...s, earliestDataDate: e.target.value || null }))} />
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">6 · Permission overrides</h2>
          <div className="mt-3 space-y-1">
            {PERMISSION_KEYS.filter((k) => k !== "reports.export").map((k) => (
              <div key={k} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/60">
                <div className="min-w-0">
                  <p className={cn("text-sm", !effectivePerms.has(k) && "text-muted-foreground")}>{PERMISSIONS[k as PermissionKey].label}</p>
                </div>
                <TriToggle label={PERMISSIONS[k as PermissionKey].label} value={ov(v.permissionOverrides, k)} onChange={(t) => setOv("permissionOverrides", k, t)} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {inviteLink && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-900">Invitation link (valid 72 hours, single use)</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={inviteLink} className="bg-white font-mono text-xs" />
            <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success("Copied"); }}><Copy className="size-4" /></Button>
          </div>
          <p className="mt-2 text-xs text-emerald-900/80">Share it privately with the invitee. Configure SMTP to email invitations automatically.</p>
        </div>
      )}

      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur">
        <Button onClick={save} disabled={saving || !v.roleIds.length || (mode === "invite" && (!email || !name))}>
          {saving ? "Saving…" : mode === "invite" ? "Create user & invite" : "Save access"}
        </Button>
      </div>
    </div>
  );
}

function ScopePicker({ label, value, roleAll, onChange }: { label: string; value: boolean | null; roleAll: boolean; onChange: (v: boolean | null) => void }) {
  const opts: { v: boolean | null; t: string }[] = [
    { v: null, t: `Role default (${roleAll ? "all" : "selected"})` },
    { v: true, t: `All ${label}` },
    { v: false, t: `Selected ${label} only` },
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {opts.map((o) => (
        <button key={String(o.v)} type="button" onClick={() => onChange(o.v)} className={cn("rounded-full border px-3 py-1 text-xs", value === o.v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
          {o.t}
        </button>
      ))}
    </div>
  );
}
