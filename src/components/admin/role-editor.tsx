"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { METRICS } from "@/lib/metrics/catalog";
import { PERMISSIONS, PERMISSION_KEYS } from "@/lib/access/permissions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface RoleData {
  id?: string;
  name: string;
  description: string | null;
  permissions: string[];
  metrics: string[];
  allAdAccounts: boolean;
  allCreators: boolean;
  maxLookbackDays: number | null;
  isSystem?: boolean;
  userCount?: number;
}

export function RoleEditor({ role, trigger }: { role?: RoleData; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<RoleData>(role ?? { name: "", description: "", permissions: ["reports.creators"], metrics: [], allAdAccounts: true, allCreators: false, maxLookbackDays: 90 });
  const toggle = (field: "permissions" | "metrics", k: string, on: boolean) => setR((s) => ({ ...s, [field]: on ? [...s[field], k] : s[field].filter((x) => x !== k) }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{role?.id ? `Edit role: ${role.name}` : "New custom role"}</DialogTitle></DialogHeader>
        {role?.userCount ? <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">Changes apply immediately to {role.userCount} user(s) with this role.</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="rname">Name</Label><Input id="rname" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="rdesc">Description</Label><Input id="rdesc" value={r.description ?? ""} onChange={(e) => setR({ ...r, description: e.target.value })} /></div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm"><Switch checked={r.allAdAccounts} onCheckedChange={(v) => setR({ ...r, allAdAccounts: v })} /> All ad accounts</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={r.allCreators} onCheckedChange={(v) => setR({ ...r, allCreators: v })} /> All creators</label>
          <label className="flex items-center gap-2 text-sm">Max look-back <Input type="number" className="h-8 w-24" min={0} placeholder="∞" value={r.maxLookbackDays ?? ""} onChange={(e) => setR({ ...r, maxLookbackDays: e.target.value === "" ? null : Number(e.target.value) })} /> days</label>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold">Permissions</p>
            {PERMISSION_KEYS.map((k) => (
              <label key={k} className="flex items-start gap-2 py-1 text-sm">
                <Checkbox className="mt-0.5" checked={r.permissions.includes(k)} onCheckedChange={(c) => toggle("permissions", k, Boolean(c))} />
                <span>{PERMISSIONS[k].label}<span className="block text-xs text-muted-foreground">{PERMISSIONS[k].description}</span></span>
              </label>
            ))}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Visible metrics</p>
            <div className="max-h-[420px] overflow-y-auto">
              {METRICS.map((m) => (
                <label key={m.key} className="flex items-center gap-2 py-0.5 text-sm">
                  <Checkbox checked={r.metrics.includes(m.key)} onCheckedChange={(c) => toggle("metrics", m.key, Boolean(c))} />
                  {m.label}{m.sensitive && <span className="text-[10px] uppercase text-muted-foreground">sensitive</span>}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={async () => {
              try {
                await api(role?.id ? `/api/v1/admin/roles/${role.id}` : "/api/v1/admin/roles", { method: role?.id ? "PATCH" : "POST", body: { name: r.name, description: r.description, permissions: r.permissions, metrics: r.metrics, allAdAccounts: r.allAdAccounts, allCreators: r.allCreators, maxLookbackDays: r.maxLookbackDays } });
                toast.success("Role saved");
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Save role
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
