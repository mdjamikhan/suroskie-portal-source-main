import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { pageAccess } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { RoleEditor } from "@/components/admin/role-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Roles" };

export default function RolesPage() {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <Roles />
    </Suspense>
  );
}

async function Roles() {
  const ctx = await pageAccess("users.manage");
  const roles = await prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], include: { permissions: true, metrics: true, _count: { select: { users: true } } } });
  return (
    <>
      <PageHeader
        title="Roles"
        description="Default and custom roles. A user's access is the union of their roles, then adjusted by per-user overrides."
        actions={<><Link href="/users" className="text-sm text-muted-foreground hover:text-foreground">← Users</Link>{ctx.isSuperAdmin && <RoleEditor trigger={<Button size="sm">New custom role</Button>} />}</>}
      />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((r) => (
            <div key={r.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.name} {r.isSystem && <Badge variant="secondary" className="ml-1">default</Badge>}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                </div>
                {ctx.isSuperAdmin && r.key !== "super_admin" && (
                  <RoleEditor
                    role={{ id: r.id, name: r.name, description: r.description, permissions: r.permissions.map((p) => p.permissionKey), metrics: r.metrics.map((m) => m.metricKey), allAdAccounts: r.allAdAccounts, allCreators: r.allCreators, maxLookbackDays: r.maxLookbackDays, isSystem: r.isSystem, userCount: r._count.users }}
                    trigger={<Button size="sm" variant="outline">Edit</Button>}
                  />
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {r._count.users} user(s) · {r.allAdAccounts ? "all accounts" : "assigned accounts"} · {r.allCreators ? "all creators" : "assigned creators"} · {r.maxLookbackDays === null ? "unlimited history" : `${r.maxLookbackDays}-day look-back`} · {r.permissions.length} permissions · {r.metrics.length} metrics
              </p>
            </div>
          ))}
        </div>
      </PageBody>
    </>
  );
}
