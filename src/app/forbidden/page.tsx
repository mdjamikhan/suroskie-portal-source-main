import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <ShieldAlert className="mx-auto size-10 text-muted-foreground" />
      <h1 className="mt-4 text-lg font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your account doesn&apos;t include this report or setting. If you need it, ask a Suroskie administrator to update your access.</p>
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">Go to your home page</Link>
    </div>
  );
}
