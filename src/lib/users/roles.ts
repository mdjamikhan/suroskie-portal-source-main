// Custom and default roles. The Super Admin role is locked so admins cannot lock themselves out.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, type AuditActor } from "@/lib/audit";
import type { AccessContext } from "@/lib/access/context";
import { isPermissionKey, SUPER_ADMIN_ROLE } from "@/lib/access/permissions";
import { isMetricKey } from "@/lib/metrics/catalog";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export const roleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional().nullable(),
  permissions: z.array(z.string()).max(50),
  metrics: z.array(z.string()).max(200),
  allAdAccounts: z.boolean(),
  allCreators: z.boolean(),
  maxLookbackDays: z.number().int().min(0).max(3650).nullable(),
});

function validate(input: z.infer<typeof roleSchema>) {
  for (const p of input.permissions) if (!isPermissionKey(p)) throw new ValidationError(`Unknown permission ${p}`);
  for (const m of input.metrics) if (!isMetricKey(m)) throw new ValidationError(`Unknown metric ${m}`);
}

function requireSuper(ctx: AccessContext) {
  // Roles change what many users can see at once, so only Super Admins may edit them.
  if (!ctx.isSuperAdmin) throw new ForbiddenError("Only a Super Admin can create or edit roles");
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

export async function createRole(ctx: AccessContext, actor: AuditActor, raw: unknown) {
  requireSuper(ctx);
  const input = roleSchema.parse(raw);
  validate(input);
  const key = `custom_${slug(input.name)}`;
  if (await prisma.role.findUnique({ where: { key } })) throw new ConflictError("A role with this name already exists");
  const role = await prisma.role.create({
    data: {
      key, name: input.name, description: input.description ?? null, isSystem: false,
      allAdAccounts: input.allAdAccounts, allCreators: input.allCreators, maxLookbackDays: input.maxLookbackDays,
      permissions: { create: input.permissions.map((permissionKey) => ({ permissionKey })) },
      metrics: { create: input.metrics.map((metricKey) => ({ metricKey })) },
    },
  });
  await audit(actor, "role.created", `Created role ${input.name}`, { targetType: "role", targetId: role.id, metadata: input });
  return role;
}

export async function updateRole(ctx: AccessContext, actor: AuditActor, roleId: string, raw: unknown) {
  requireSuper(ctx);
  const input = roleSchema.parse(raw);
  validate(input);
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { permissions: true, metrics: true } });
  if (!role) throw new NotFoundError("Role not found");
  if (role.key === SUPER_ADMIN_ROLE) throw new ValidationError("The Super Admin role always has full access and cannot be edited");
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.roleMetric.deleteMany({ where: { roleId } }),
    prisma.role.update({
      where: { id: roleId },
      data: {
        name: input.name, description: input.description ?? null, allAdAccounts: input.allAdAccounts, allCreators: input.allCreators, maxLookbackDays: input.maxLookbackDays,
        permissions: { create: input.permissions.map((permissionKey) => ({ permissionKey })) },
        metrics: { create: input.metrics.map((metricKey) => ({ metricKey })) },
      },
    }),
  ]);
  await audit(actor, "role.updated", `Updated role ${input.name}`, {
    targetType: "role", targetId: roleId,
    metadata: { before: { permissions: role.permissions.map((p) => p.permissionKey), metrics: role.metrics.map((m) => m.metricKey), allAdAccounts: role.allAdAccounts, allCreators: role.allCreators, maxLookbackDays: role.maxLookbackDays }, after: input },
  });
}

export async function deleteRole(ctx: AccessContext, actor: AuditActor, roleId: string) {
  requireSuper(ctx);
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
  if (!role) throw new NotFoundError("Role not found");
  if (role.isSystem) throw new ValidationError("Default roles cannot be deleted");
  if (role._count.users > 0) throw new ValidationError("Reassign the users of this role before deleting it");
  await prisma.role.delete({ where: { id: roleId } });
  await audit(actor, "role.deleted", `Deleted role ${role.name}`, { targetType: "role", targetId: roleId });
}
