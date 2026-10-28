import { Suspense } from "react";
import { pageAccess } from "@/lib/auth/session";
import { canAny } from "@/lib/access/context";
import { NAV_ITEMS } from "@/lib/access/permissions";
import { prisma } from "@/lib/db";
import { demoMode } from "@/lib/reporting/service";
import { Sidebar } from "@/components/app/sidebar";
import { SidebarSkeleton } from "@/components/app/skeletons";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Suspense fallback={<SidebarSkeleton />}>
        <AppSidebar />
      </Suspense>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

async function AppSidebar() {
  const ctx = await pageAccess();
  // Only render navigation the user is authorised to use (pages enforce this again server-side).
  const items = NAV_ITEMS.filter((i) => canAny(ctx, Array.isArray(i.permission) ? i.permission : [i.permission])).map(({ href, label, icon }) => ({ href, label, icon }));
  const roles = await prisma.role.findMany({ where: { key: { in: ctx.roleKeys } }, select: { name: true } });
  return <Sidebar items={items} user={{ name: ctx.name, email: ctx.email, roles: roles.map((r) => r.name) }} demo={demoMode()} />;
}
