import { Suspense } from "react";
import { redirect } from "next/navigation";
import { pageAccess } from "@/lib/auth/session";
import { canAny } from "@/lib/access/context";
import { NAV_ITEMS } from "@/lib/access/permissions";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <RedirectHome />
    </Suspense>
  );
}

async function RedirectHome(): Promise<never> {
  const ctx = await pageAccess();
  const first = NAV_ITEMS.find((i) => canAny(ctx, Array.isArray(i.permission) ? i.permission : [i.permission]));
  redirect(first?.href ?? "/forbidden");
}
