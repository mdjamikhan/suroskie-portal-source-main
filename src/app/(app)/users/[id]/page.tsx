import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { pageAccess } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { accessEditorData } from "@/lib/users/editor-data";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/metrics/format";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { AccessEditor } from "@/components/admin/access-editor";
import { UserActions } from "@/components/admin/user-actions";

export const metadata: Metadata = { title: "Edit user" };

export default function UserPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <EditUser params={params} />
    </Suspense>
  );
}

async function EditUser({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageAccess("users.manage");
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    include: { roles: true, adAccountAccess: true, creatorAccess: true, permissionOverrides: true, metricOverrides: true, invitations: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!user) notFound();
  const [data, settings, activity] = await Promise.all([
    accessEditorData(ctx),
    getSettings(),
    prisma.auditLog.findMany({ where: { OR: [{ actorId: id }, { targetType: "user", targetId: id }] }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const isTargetSuper = (await prisma.role.findMany({ where: { id: { in: user.roles.map((r) => r.roleId) } } })).some((r) => r.key === "super_admin");
  const readOnly = isTargetSuper && !ctx.isSuperAdmin;

  return (
    <>
      <PageHeader
        title={user.name}
        description={<span>{user.email} · {user.status.toLowerCase()} · last sign-in {formatDateTime(user.lastLoginAt, settings.reportingTimezone)}{user.status === "INVITED" && user.invitations[0] ? ` · invitation expires ${formatDateTime(user.invitations[0].expiresAt, settings.reportingTimezone)}` : ""}</span>}
        actions={<><Link href="/users" className="text-sm text-muted-foreground hover:text-foreground">← All users</Link>{!readOnly && <UserActions userId={user.id} status={user.status} isSelf={user.id === ctx.userId} />}</>}
      />
      <PageBody>
        {readOnly ? (
          <p className="rounded-lg border bg-card p-4 text-sm">Only a Super Admin can change another Super Admin.</p>
        ) : (
          <AccessEditor
            mode="edit"
            userId={user.id}
            roles={data.roles}
            accounts={data.accounts}
            creators={data.creators}
            initial={{
              roleIds: user.roles.map((r) => r.roleId),
              adAccountIds: user.adAccountAccess.map((a) => a.adAccountId),
              creatorIds: user.creatorAccess.map((c) => c.creatorId),
              allAdAccounts: user.allAdAccounts,
              allCreators: user.allCreators,
              maxLookbackDays: user.maxLookbackDays,
              earliestDataDate: user.earliestDataDate?.toISOString().slice(0, 10) ?? null,
              permissionOverrides: user.permissionOverrides.map((p) => ({ key: p.permissionKey, granted: p.granted })),
              metricOverrides: user.metricOverrides.map((m) => ({ key: m.metricKey, granted: m.granted })),
            }}
          />
        )}
        <Section title="Recent activity" flush>
          <ul className="divide-y">
            {activity.length === 0 && <li className="p-4 text-sm text-muted-foreground">No recorded activity.</li>}
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5 text-sm">
                <span>{a.summary} <span className="text-xs text-muted-foreground">by {a.actorEmail ?? "system"}</span></span>
                <span className="text-xs text-muted-foreground">{formatDateTime(a.createdAt, settings.reportingTimezone)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </PageBody>
    </>
  );
}
