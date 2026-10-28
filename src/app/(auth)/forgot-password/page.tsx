"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      {sent ? (
        <p className="mt-4 text-sm text-muted-foreground">If an active account exists for that email, a reset link is on its way. The link expires in 1 hour.</p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            const email = String(new FormData(e.currentTarget).get("email"));
            await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
            setSent(true); // Same response whether or not the account exists.
            setLoading(false);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <Button type="submit" className="h-10 w-full" disabled={loading}>Send reset link</Button>
        </form>
      )}
      <Link href="/login" className="mt-6 inline-block text-sm text-primary hover:underline">Back to sign in</Link>
    </>
  );
}
