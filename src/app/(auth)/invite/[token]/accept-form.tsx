"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AcceptInviteForm({ token, email, defaultName }: { token: string; email: string; defaultName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const password = String(fd.get("password"));
        if (password !== String(fd.get("confirm"))) return setError("Passwords do not match.");
        setLoading(true);
        setError(null);
        const res = await fetch("/api/v1/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, name: fd.get("name"), password }) });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setLoading(false);
          return setError(body?.error?.details?.[0]?.message ?? body?.error?.message ?? "Could not accept the invitation.");
        }
        const { error } = await authClient.signIn.email({ email, password });
        window.location.href = error ? "/login" : "/";
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" defaultValue={defaultName} required maxLength={120} autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" />
        <p className="text-xs text-muted-foreground">At least 12 characters. A passphrase works well.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" minLength={12} required autoComplete="new-password" />
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button type="submit" className="h-10 w-full" disabled={loading}>
        {loading && <Loader2 className="size-4 animate-spin" />} Create account
      </Button>
    </form>
  );
}
