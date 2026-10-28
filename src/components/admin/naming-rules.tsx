"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface Rule { id: string; name: string; source: string; matchField: string; prefix: string; priority: number; enabled: boolean }

const SOURCE: Record<string, string> = { AD_NAME: "Ad name", ADSET_NAME: "Ad set name", CAMPAIGN_NAME: "Campaign name" };
const FIELD: Record<string, string> = { CREATOR_CODE: "Creator ID", INSTAGRAM_HANDLE: "Instagram handle" };

export function NamingRules({ rules, canApply }: { rules: Rule[]; canApply: boolean }) {
  const router = useRouter();
  const [preview, setPreview] = useState<{ matched: number; ambiguous: number; scanned: number; preview: { adName: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const r = await api<NonNullable<typeof preview>>("/api/v1/admin/naming-rules/apply", { body: { dryRun } });
      if (dryRun) setPreview(r);
      else {
        toast.success(`Mapped ${r.matched} ad(s). ${r.ambiguous} ambiguous name(s) left for review.`);
        setPreview(null);
        router.refresh();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Rules match a creator&apos;s ID or Instagram handle as a whole token in ad, ad set or campaign names (for example <code className="rounded bg-muted px-1">S25_CR014_HookA</code>). They only map
        <strong> unmapped</strong> ads, never override manual mappings, and leave names that match more than one creator for review. Rules also run after every sync.
      </p>
      <ul className="divide-y rounded-lg border">
        {rules.length === 0 && <li className="p-4 text-sm text-muted-foreground">No rules yet.</li>}
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <Switch
              checked={r.enabled}
              aria-label={`Enable ${r.name}`}
              onCheckedChange={async (enabled) => {
                try {
                  await api(`/api/v1/admin/naming-rules/${r.id}`, { method: "PATCH", body: { ...r, enabled } });
                  router.refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">{SOURCE[r.source]} contains “{r.prefix}{"{"}{FIELD[r.matchField]}{"}"}” · priority {r.priority}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${r.name}`}
              onClick={async () => {
                if (!confirm(`Delete rule “${r.name}”? Existing mappings are kept.`)) return;
                await api(`/api/v1/admin/naming-rules/${r.id}`, { method: "DELETE" }).catch((e) => toast.error((e as Error).message));
                router.refresh();
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          try {
            await api("/api/v1/admin/naming-rules", { body: { name: fd.get("name"), source: fd.get("source"), matchField: fd.get("matchField"), prefix: fd.get("prefix") ?? "", priority: Number(fd.get("priority") || 100), enabled: true } });
            form.reset();
            toast.success("Rule added");
            router.refresh();
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      >
        <Input name="name" placeholder="Rule name" required className="h-9 w-48" />
        <select name="source" className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Name to search">
          <option value="AD_NAME">Ad name</option><option value="ADSET_NAME">Ad set name</option><option value="CAMPAIGN_NAME">Campaign name</option>
        </select>
        <select name="matchField" className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Creator field">
          <option value="CREATOR_CODE">Creator ID</option><option value="INSTAGRAM_HANDLE">Instagram handle</option>
        </select>
        <Input name="prefix" placeholder="Prefix (optional, e.g. CR-)" className="h-9 w-44" />
        <Input name="priority" type="number" placeholder="Priority" defaultValue={100} className="h-9 w-24" aria-label="Priority" />
        <Button type="submit" size="sm" variant="outline" className="h-9">Add rule</Button>
      </form>
      {canApply && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => run(true)}><Wand2 className="size-4" /> Preview matches</Button>
          {preview && (
            <>
              <span className="text-sm">{preview.matched} of {preview.scanned} unmapped ads would be mapped; {preview.ambiguous} ambiguous.</span>
              <Button size="sm" disabled={busy || !preview.matched} onClick={() => run(false)}>Apply now</Button>
            </>
          )}
        </div>
      )}
      {preview && preview.preview.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-md bg-muted p-3 text-xs">
          {preview.preview.map((p, i) => <li key={i} className="truncate">{p.adName}</li>)}
        </ul>
      )}
    </div>
  );
}
