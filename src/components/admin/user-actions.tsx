"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

export function UserActions({ userId, status, isSelf }: { userId: string; status: string; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  async function act(action: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try {
      const r = await api<{ inviteUrl?: string | null }>(`/api/v1/admin/users/${userId}/actions`, { body: { action } });
      if (r?.inviteUrl) setLink(r.inviteUrl);
      toast.success("Done");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "INVITED" && <Button size="sm" variant="outline" disabled={busy} onClick={() => act("resend_invitation")}>Resend invitation</Button>}
      {status === "ACTIVE" && !isSelf && <Button size="sm" variant="outline" disabled={busy} onClick={() => act("revoke_sessions", "Sign this user out of all devices?")}>Sign out everywhere</Button>}
      {status !== "SUSPENDED" && !isSelf && <Button size="sm" variant="destructive" disabled={busy} onClick={() => act("suspend", "Suspend this user? They are signed out immediately and cannot sign in until reactivated.")}>Suspend & revoke access</Button>}
      {status === "SUSPENDED" && <Button size="sm" disabled={busy} onClick={() => act("reactivate")}>Reactivate</Button>}
      {link && <p className="w-full rounded bg-emerald-50 p-2 font-mono text-xs break-all">{link}</p>}
    </div>
  );
}
