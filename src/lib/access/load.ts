import { prisma } from "@/lib/db";
import { UnauthorizedError } from "@/lib/errors";
import { resolveAccess, type AccessContext } from "./context";

export async function loadAccessContext(userId: string): Promise<AccessContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: true, metrics: true } } } },
      permissionOverrides: true,
      metricOverrides: true,
      adAccountAccess: { select: { adAccountId: true } },
      creatorAccess: { select: { creatorId: true } },
    },
  });
  if (!user) throw new UnauthorizedError();
  return resolveAccess({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      allAdAccounts: user.allAdAccounts,
      allCreators: user.allCreators,
      maxLookbackDays: user.maxLookbackDays,
      earliestDataDate: user.earliestDataDate ? user.earliestDataDate.toISOString().slice(0, 10) : null,
    },
    roles: user.roles.map(({ role }) => ({
      key: role.key,
      allAdAccounts: role.allAdAccounts,
      allCreators: role.allCreators,
      maxLookbackDays: role.maxLookbackDays,
      permissions: role.permissions.map((p) => p.permissionKey),
      metrics: role.metrics.map((m) => m.metricKey),
    })),
    permissionOverrides: user.permissionOverrides,
    metricOverrides: user.metricOverrides,
    adAccountIds: user.adAccountAccess.map((a) => a.adAccountId),
    creatorIds: user.creatorAccess.map((c) => c.creatorId),
  });
}
