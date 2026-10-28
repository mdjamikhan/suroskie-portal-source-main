"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { History, Link2Off, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreatorSearch } from "@/components/reports/creator-search";
import { Thumb } from "@/components/reports/thumb";
import { formatDateTime } from "@/lib/metrics/format";

export interface MappingRow {
  id: string;
  metaAdId: string;
  name: string;
  effectiveStatus: string | null;
  adAccount: { id: string; name: string };
  campaign: { id: string; name: string };
  adSet: { id: string; name: string };
  creative: { thumbnailUrl: string | null; creativeType: string } | null;
  mapping: { method: string; creator: { id: string; name: string; code: string }; creativeAsset: { id: string; title: string } | null } | null;
}

interface Asset { id: string; title: string; product: string | null; creativeType: string }

export function MappingWorkspace({ rows }: { rows: MappingRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creator, setCreator] = useState<{ id: string; name: string } | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyFor, setHistoryFor] = useState<MappingRow | null>(null);
  const [newAsset, setNewAsset] = useState(false);

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = selected.size > 0 && allIds.every((id) => selected.has(id));
  const reassigning = rows.filter((r) => selected.has(r.id) && r.mapping && r.mapping.creator.id !== creator?.id).length;

  function chooseCreator(c: { id: string; name: string }) {
    setCreator(c);
    setAssetId("");
    setAssets([]);
    api<Asset[]>(`/api/v1/admin/assets?creatorId=${c.id}`).then(setAssets).catch(() => setAssets([]));
  }

  async function submit(creatorId: string | null) {
    setBusy(true);
    try {
      const r = await api<{ changed: number }>("/api/v1/admin/mappings", { body: { adIds: [...selected], creatorId, creativeAssetId: creatorId ? assetId || null : null, reason: reason || undefined } });
      toast.success(creatorId ? `Mapped ${r.changed} ad(s) to ${creator?.name}` : `Unmapped ${r.changed} ad(s)`);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-20 flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm lg:top-2 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="text-sm">
          <p className="font-medium">{selected.size} ad{selected.size === 1 ? "" : "s"} selected</p>
          {reassigning > 0 && <p className="text-xs text-amber-700">{reassigning} already mapped to another creator will be reassigned.</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Creator</Label>
          <CreatorSearch navigate={false} placeholder={creator ? creator.name : "Choose creator…"} onSelect={(c) => chooseCreator({ id: c.id, name: c.name })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="asset" className="text-[11px] uppercase tracking-wide text-muted-foreground">Creative asset (optional)</Label>
          <div className="flex flex-wrap gap-2">
            <select id="asset" value={assetId} onChange={(e) => setAssetId(e.target.value)} disabled={!creator} className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50 sm:w-56">
              <option value="">No asset</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.title}{a.product ? ` · ${a.product}` : ""}</option>)}
            </select>
            <Button type="button" variant="ghost" size="sm" className="h-9" disabled={!creator} onClick={() => setNewAsset(true)}>New asset</Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="reason" className="text-[11px] uppercase tracking-wide text-muted-foreground">Reason (audit log)</Label>
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. per content brief" className="h-9 w-full sm:w-56" maxLength={300} />
        </div>
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          <Button disabled={!selected.size || !creator || busy} onClick={() => submit(creator!.id)}><UserPlus className="size-4" /> Assign</Button>
          <Button variant="outline" disabled={!selected.size || busy} onClick={() => submit(null)}><Link2Off className="size-4" /> Unmap</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox aria-label="Select all on this page" checked={allSelected} onCheckedChange={(c) => setSelected(c ? new Set(allIds) : new Set())} />
              </TableHead>
              <TableHead className="min-w-[300px]">Ad</TableHead>
              <TableHead>Campaign / ad set</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Creator</TableHead>
              <TableHead className="w-10"><span className="sr-only">History</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No ads match these filters.</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onCheckedChange={(c) => setSelected((s) => { const n = new Set(s); if (c) n.add(r.id); else n.delete(r.id); return n; })} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Thumb url={r.creative?.thumbnailUrl ?? null} type={r.creative?.creativeType ?? "UNKNOWN"} size={36} />
                    <div className="min-w-0">
                      <p className="max-w-[340px] truncate font-medium" title={r.name}>{r.name}</p>
                      <p className="text-xs text-muted-foreground">Ad ID {r.metaAdId} · {(r.effectiveStatus ?? "unknown").toLowerCase().replace(/_/g, " ")} · {(r.creative?.creativeType ?? "unknown").toLowerCase()}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <p className="truncate text-sm" title={r.campaign.name}>{r.campaign.name}</p>
                  <p className="truncate text-xs text-muted-foreground" title={r.adSet.name}>{r.adSet.name}</p>
                </TableCell>
                <TableCell className="text-sm">{r.adAccount.name}</TableCell>
                <TableCell>
                  {r.mapping ? (
                    <div>
                      <p className="text-sm font-medium">{r.mapping.creator.name}</p>
                      <p className="text-xs text-muted-foreground">{r.mapping.creativeAsset?.title ?? "No asset"} · {r.mapping.method === "NAMING_RULE" ? "naming rule" : r.mapping.method.toLowerCase()}</p>
                    </div>
                  ) : (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Needs review</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" aria-label="Mapping history" onClick={() => setHistoryFor(r)}><History className="size-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {historyFor && <HistoryDialog row={historyFor} onClose={() => setHistoryFor(null)} />}
      {newAsset && creator && (
        <NewAssetDialog creator={creator} onClose={() => setNewAsset(false)} onCreated={(a) => { setAssets((xs) => [a, ...xs]); setAssetId(a.id); setNewAsset(false); }} />
      )}
    </div>
  );
}

function HistoryDialog({ row, onClose }: { row: MappingRow; onClose: () => void }) {
  const [items, setItems] = useState<{ id: string; at: string; method: string; reason: string | null; from: { name: string } | null; to: { name: string } | null; by: string }[] | null>(null);
  useEffect(() => {
    api<typeof items>(`/api/v1/admin/mappings/history?adId=${row.id}`).then(setItems).catch((e) => toast.error((e as Error).message));
  }, [row.id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Mapping history</DialogTitle></DialogHeader>
        <p className="truncate text-sm text-muted-foreground">{row.name}</p>
        {!items ? <p className="text-sm">Loading…</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">No mapping changes recorded.</p> : (
          <ol className="max-h-80 space-y-3 overflow-y-auto">
            {items.map((i) => (
              <li key={i.id} className="rounded-md border p-3 text-sm">
                <p><span className="text-muted-foreground">{i.from?.name ?? "Unmapped"}</span> → <strong>{i.to?.name ?? "Unmapped"}</strong></p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(i.at)} · {i.by} · {i.method.toLowerCase().replace("_", " ")}{i.reason ? ` · “${i.reason}”` : ""}</p>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewAssetDialog({ creator, onClose, onCreated }: { creator: { id: string; name: string }; onClose: () => void; onCreated: (a: Asset) => void }) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>New creative asset for {creator.name}</DialogTitle></DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setSaving(true);
            try {
              const a = await api<Asset>("/api/v1/admin/assets", {
                body: {
                  creatorId: creator.id, title: fd.get("title"), creativeType: fd.get("creativeType"), product: fd.get("product") || null, contentAngle: fd.get("contentAngle") || null,
                  hook: fd.get("hook") || null, launchDate: fd.get("launchDate") || null, notes: fd.get("notes") || null,
                  tags: String(fd.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
                },
              });
              toast.success("Asset created");
              onCreated(a);
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="space-y-1"><Label htmlFor="title">Asset title / internal name</Label><Input id="title" name="title" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="creativeType">Type</Label>
              <select id="creativeType" name="creativeType" className="h-9 w-full rounded-md border bg-background px-2 text-sm" defaultValue="VIDEO">
                <option value="VIDEO">Video</option><option value="IMAGE">Image</option><option value="CAROUSEL">Carousel</option><option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1"><Label htmlFor="product">Product</Label><Input id="product" name="product" /></div>
            <div className="space-y-1"><Label htmlFor="contentAngle">Content angle</Label><Input id="contentAngle" name="contentAngle" /></div>
            <div className="space-y-1"><Label htmlFor="launchDate">Launch date</Label><Input id="launchDate" name="launchDate" type="date" /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="hook">Hook</Label><Input id="hook" name="hook" /></div>
          <div className="space-y-1"><Label htmlFor="tags">Campaign tags (comma-separated)</Label><Input id="tags" name="tags" /></div>
          <div className="space-y-1"><Label htmlFor="notes">Notes</Label><Input id="notes" name="notes" /></div>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create asset"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
