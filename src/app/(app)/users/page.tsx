import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { pageAccess } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/metrics/format";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "User management" };
const STATUS: Record<string, string> = { ACTIVE: "bg-emerald-100 text-emerald-800", INVITED: "bg-blue-100 text-blue-800", SUSPENDED: "bg-red-100 text-red-800" };

export default function UsersPage() {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <Users />
    </Suspense>
  );
}

async function Users() {
  await pageAccess("users.manage");
  const [users, settings] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: { roles: { include: { role: { select: { name: true } } } }, _count: { select: { creatorAccess: true, adAccountAccess: true } } },
    }),
    getSettings(),
  ]);
  return (
    <>
      <PageHeader
        title="User management"
        description="Invite people, assign roles and control exactly which creators, accounts and metrics they see."
        actions={
          <>
            <Button asChild variant="outline" size="sm"><Link href="/users/roles">Roles</Link></Button>
            <Button asChild size="sm"><Link href="/users/new"><UserPlus className="size-4" /> Invite user</Link></Button>
          </>
        }
      />
      <PageBody>
        <Section flush>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sign-in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Link href={`/users/${u.id}`} className="font-medium hover:underline">{u.name}</Link>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell className="text-sm">{u.roles.map((r) => r.role.name).join(", ") || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.allCreators === true ? "All creators" : `${u._count.creatorAccess} creator(s)`} · {u.allAdAccounts === true ? "all accounts" : `${u._count.adAccountAccess} account(s)`}
                    </TableCell>
                    <TableCell><span className={cn("rounded px-2 py-0.5 text-xs font-medium", STATUS[u.status])}>{u.status.toLowerCase()}</span></TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDateTime(u.lastLoginAt, settings.reportingTimezone)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      </PageBody>
    </>
  );
}
