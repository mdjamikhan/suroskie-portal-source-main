"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export interface CreatorFormValues {
  id?: string;
  code: string;
  name: string;
  instagramHandle: string | null;
  profileImageUrl: string | null;
  notes: string | null;
  isActive: boolean;
  team: string | null;
  ownerUserId: string | null;
}

export function CreatorFormDialog({ initial, owners }: { initial?: CreatorFormValues; owners: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(initial?.isActive ?? true);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? <Button variant="outline" size="sm"><Pencil className="size-3.5" /> Edit creator</Button> : <Button size="sm"><Plus className="size-4" /> New creator</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit creator" : "New creator"}</DialogTitle>
        </DialogHeader>
        <form
          id="creator-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const body = {
              code: fd.get("code"), name: fd.get("name"), instagramHandle: fd.get("instagramHandle") || null, profileImageUrl: fd.get("profileImageUrl") || null,
              notes: fd.get("notes") || null, team: fd.get("team") || null, ownerUserId: fd.get("ownerUserId") || null, isActive: active,
            };
            setSaving(true);
            try {
              const c = await api<{ id: string }>(initial?.id ? `/api/v1/admin/creators/${initial.id}` : "/api/v1/admin/creators", { method: initial?.id ? "PATCH" : "POST", body });
              toast.success(initial ? "Creator updated" : "Creator created");
              setOpen(false);
              if (!initial) router.push(`/creators/${c.id}`);
              else router.refresh();
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Creator ID</Label>
              <Input id="code" name="code" required defaultValue={initial?.code} placeholder="CR014" />
              <p className="text-[11px] text-muted-foreground">Used by naming-convention rules.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required defaultValue={initial?.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="instagramHandle">Instagram handle</Label>
              <Input id="instagramHandle" name="instagramHandle" defaultValue={initial?.instagramHandle ?? ""} placeholder="handle (without @)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team">Content team</Label>
              <Input id="team" name="team" defaultValue={initial?.team ?? ""} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profileImageUrl">Profile image URL</Label>
            <Input id="profileImageUrl" name="profileImageUrl" type="url" defaultValue={initial?.profileImageUrl ?? ""} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ownerUserId">Owner</Label>
            <select id="ownerUserId" name="ownerUserId" defaultValue={initial?.ownerUserId ?? ""} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">No owner</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Internal notes</Label>
            <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} rows={3} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="isActive" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="isActive">Active</Label>
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="creator-form" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
