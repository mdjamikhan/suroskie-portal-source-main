"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetForm() {
  const token = useSearchParams().get("token");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (!token) return <p className="mt-4 text-sm text-red-700">This reset link is invalid or has expired. <Link className="underline" href="/forgot-password">Request a new one</Link>.</p>;
  if (done) return <p className="mt-4 text-sm">Your password has been changed and other sessions were signed out. <Link className="text-primary underline" href="/login">Sign in</Link>.</p>;
  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const pw = String(fd.get("password"));
        if (pw !== String(fd.get("confirm"))) return setError("Passwords do not match.");
        const { error } = await authClient.resetPassword({ newPassword: pw, token });
        if (error) return setError(error.message ?? "This reset link is invalid or has expired.");
        setDone(true);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" minLength={12} required autoComplete="new-password" />
        <p className="text-xs text-muted-foreground">At least 12 characters.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" minLength={12} required autoComplete="new-password" />
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button type="submit" className="h-10 w-full">Set password</Button>
    </form>
  );
}
