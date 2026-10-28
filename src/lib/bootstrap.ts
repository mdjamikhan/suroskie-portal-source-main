// Idempotent reference-data seeding: permissions, metric catalogue, default roles.
// Safe to run on every deploy: it never overwrites an admin's edits to existing roles and
// never resets a metric's "unsupported" flag set by the sync engine.
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { METRICS } from "@/lib/metrics/catalog";
import { DEFAULT_ROLES, PERMISSIONS, PERMISSION_KEYS, SUPER_ADMIN_ROLE } from "@/lib/access/permissions";

export async function seedReferenceData(prisma: PrismaClient) {
  for (const key of PERMISSION_KEYS) {
    const p = PERMISSIONS[key];
    await prisma.permission.upsert({ where: { key }, create: { key, label: p.label, description: p.description, category: p.category }, update: { label: p.label, description: p.description, category: p.category } });
  }
  for (const [i, m] of METRICS.entries()) {
    const data = { label: m.label, description: m.description, formula: m.formula ?? null, category: m.category, unit: m.unit, isSensitive: m.sensitive, higherIsBetter: m.higherIsBetter, sortOrder: i };
    await prisma.metricDefinition.upsert({ where: { key: m.key }, create: { key: m.key, ...data }, update: data });
  }
  for (const r of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { key: r.key } });
    if (existing && r.key !== SUPER_ADMIN_ROLE) continue;
    if (existing) {
      // Super Admin always holds everything (including permissions/metrics added in new releases).
      await prisma.rolePermission.createMany({ data: r.permissions.map((permissionKey) => ({ roleId: existing.id, permissionKey })), skipDuplicates: true });
      await prisma.roleMetric.createMany({ data: r.metrics.map((metricKey) => ({ roleId: existing.id, metricKey })), skipDuplicates: true });
      continue;
    }
    await prisma.role.create({
      data: {
        key: r.key, name: r.name, description: r.description, isSystem: true, allAdAccounts: r.allAdAccounts, allCreators: r.allCreators, maxLookbackDays: r.maxLookbackDays,
        permissions: { create: r.permissions.map((permissionKey) => ({ permissionKey })) },
        metrics: { create: r.metrics.map((metricKey) => ({ metricKey })) },
      },
    });
  }
}

/** Create the first Super Admin when none exists. Credentials come from env, never from code. */
export async function ensureInitialAdmin(prisma: PrismaClient, email: string | undefined, password: string | undefined, name = "Super Admin") {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: SUPER_ADMIN_ROLE } });
  const existing = await prisma.userRole.count({ where: { roleId: role.id } });
  if (existing > 0) return { created: false as const, reason: "A Super Admin already exists" };
  if (!email || !password) return { created: false as const, reason: "Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD to create the first Super Admin" };
  if (password.length < 12) throw new Error("INITIAL_ADMIN_PASSWORD must be at least 12 characters");
  const id = randomUUID();
  await prisma.$transaction([
    prisma.user.create({ data: { id, email: email.toLowerCase(), name, status: "ACTIVE", emailVerified: true } }),
    prisma.account.create({ data: { id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(password) } }),
    prisma.userRole.create({ data: { userId: id, roleId: role.id } }),
    prisma.auditLog.create({ data: { actorEmail: "system", action: "user.bootstrap_admin", summary: `Created initial Super Admin ${email}`, targetType: "user", targetId: id } }),
  ]);
  return { created: true as const, email };
}
