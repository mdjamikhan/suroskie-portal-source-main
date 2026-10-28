import { Suspense } from "react";
import Link from "next/link";
import { findValidInvitation } from "@/lib/users/service";
import { AcceptInviteForm } from "./accept-form";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Checking invitation…</p>}>
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = token.length >= 20 && token.length <= 200 ? await findValidInvitation(token) : null;
  if (!inv) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Invitation not valid</h1>
        <p className="mt-3 text-sm text-muted-foreground">This invitation link has expired, was already used, or was revoked. Ask your administrator to send a new one.</p>
        <Link href="/login" className="mt-6 inline-block text-sm text-primary hover:underline">Go to sign in</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to Suroskie</h1>
      <p className="mt-1 text-sm text-muted-foreground">Set a password for <strong>{inv.email}</strong>.</p>
      <AcceptInviteForm token={token} email={inv.email} defaultName={inv.user.name} />
    </>
  );
}
