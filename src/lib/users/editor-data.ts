import { prisma } from "@/lib/db";
import type { AccessContext } from "@/lib/access/context";
import { demoMode } from "@/lib/reporting/service";

/** Options for the access editor, limited to what the acting admin can grant. */
export async function accessEditorData(ctx: AccessContext) {
  const [roles, accounts, creators] = await Promise.all([
    prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], include: { permissions: true, metrics: true } }),
    prisma.adAccount.findMany({ where: { isDemo: demoMode(), ...(ctx.adAccounts === "ALL" ? {} : { id: { in: ctx.adAccounts } }) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.creator.findMany({ where: ctx.creators === "ALL" ? {} : { id: { in: ctx.creators } }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    roles: roles
      .filter((r) => ctx.isSuperAdmin || r.key !== "super_admin")
      .map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions.map((p) => p.permissionKey), metrics: r.metrics.map((m) => m.metricKey), allAdAccounts: r.allAdAccounts, allCreators: r.allCreators, maxLookbackDays: r.maxLookbackDays })),
    accounts,
    creators,
  };
}
