// User management: invitations, access configuration, suspension. All changes are audited.
// Privilege-escalation guard: a non-super-admin can never grant a role, permission, metric,
// account or creator they do not hold themselves, and only super admins manage super admins.
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { audit, type AuditActor } from "@/lib/audit";
import { sendEmail, simpleHtml } from "@/lib/email";
import { inScope, type AccessContext } from "@/lib/access/context";
import { isPermissionKey, SUPER_ADMIN_ROLE } from "@/lib/access/permissions";
import { isMetricKey } from "@/lib/metrics/catalog";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/auth";
import { isIsoDate } from "@/lib/reporting/date-range";

export const INVITE_TTL_HOURS = 72;

const idList = z.array(z.string().min(1).max(64)).max(1000);

export const accessSchema = z.object({
  roleIds: idList.min(1, "Assign at least one role"),
  adAccountIds: idList.default([]),
  creatorIds: idList.default([]),
  allAdAccounts: z.boolean().nullable().default(null),
  allCreators: z.boolean().nullable().default(null),
  maxLookbackDays: z.number().int().min(0).max(3650).nullable().default(null),
  earliestDataDate: z.string().refine(isIsoDate, "Use YYYY-MM-DD").nullable().default(null),
  permissionOverrides: z.array(z.object({ key: z.string(), granted: z.boolean() })).max(100).default([]),
  metricOverrides: z.array(z.object({ key: z.string(), granted: z.boolean() })).max(200).default([]),
});
export type AccessInput = z.infer<typeof accessSchema>;

export const inviteSchema = accessSchema.extend({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(120),
});

async function assertGrantable(ctx: AccessContext, input: AccessInput) {
  for (const p of input.permissionOverrides) if (!isPermissionKey(p.key)) throw new ValidationError(`Unknown permission ${p.key}`);
  for (const m of input.metricOverrides) if (!isMetricKey(m.key)) throw new ValidationError(`Unknown metric ${m.key}`);

  const roles = await prisma.role.findMany({ where: { id: { in: input.roleIds } }, include: { permissions: true, metrics: true } });
  if (roles.length !== new Set(input.roleIds).size) throw new ValidationError("Unknown role");
  const [accounts, creators] = await Promise.all([
    prisma.adAccount.count({ where: { id: { in: input.adAccountIds } } }),
    prisma.creator.count({ where: { id: { in: input.creatorIds } } }),
  ]);
  if (accounts !== new Set(input.adAccountIds).size) throw new ValidationError("Unknown ad account");
  if (creators !== new Set(input.creatorIds).size) throw new ValidationError("Unknown creator");

  if (ctx.isSuperAdmin) return roles;
  if (roles.some((r) => r.key === SUPER_ADMIN_ROLE)) throw new ForbiddenError("Only a Super Admin can grant the Super Admin role");
  const deny = (what: string) => {
    throw new ForbiddenError(`You cannot grant ${what} that you do not have yourself`);
  };
  for (const r of roles) {
    for (const p of r.permissions) if (!ctx.permissions.has(p.permissionKey as never)) deny(`the permission "${p.permissionKey}" (via role ${r.name})`);
    for (const m of r.metrics) if (!ctx.metrics.has(m.metricKey)) deny(`the metric "${m.metricKey}" (via role ${r.name})`);
    if (r.allAdAccounts && ctx.adAccounts !== "ALL") deny("access to all ad accounts");
    if (r.allCreators && ctx.creators !== "ALL") deny("access to all creators");
  }
  for (const p of input.permissionOverrides) if (p.granted && !ctx.permissions.has(p.key as never)) deny(`the permission "${p.key}"`);
  for (const m of input.metricOverrides) if (m.granted && !ctx.metrics.has(m.key)) deny(`the metric "${m.key}"`);
  if (input.allAdAccounts && ctx.adAccounts !== "ALL") deny("access to all ad accounts");
  if (input.allCreators && ctx.creators !== "ALL") deny("access to all creators");
  for (const id of input.adAccountIds) if (!inScope(ctx.adAccounts, id)) deny("an ad account");
  for (const id of input.creatorIds) if (!inScope(ctx.creators, id)) deny("a creator");
  return roles;
}

async function assertCanManage(ctx: AccessContext, userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
  if (!target) throw new NotFoundError("User not found");
  const isTargetSuper = target.roles.some((r) => r.role.key === SUPER_ADMIN_ROLE);
  if (isTargetSuper && !ctx.isSuperAdmin) throw new ForbiddenError("Only a Super Admin can manage another Super Admin");
  return { target, isTargetSuper };
}

function accessWrite(userId: string, input: AccessInput) {
  return [
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.userRole.createMany({ data: [...new Set(input.roleIds)].map((roleId) => ({ userId, roleId })) }),
    prisma.userAdAccountAccess.deleteMany({ where: { userId } }),
    prisma.userAdAccountAccess.createMany({ data: [...new Set(input.adAccountIds)].map((adAccountId) => ({ userId, adAccountId })) }),
    prisma.userCreatorAccess.deleteMany({ where: { userId } }),
    prisma.userCreatorAccess.createMany({ data: [...new Set(input.creatorIds)].map((creatorId) => ({ userId, creatorId })) }),
    prisma.userPermissionOverride.deleteMany({ where: { userId } }),
    prisma.userPermissionOverride.createMany({ data: input.permissionOverrides.map((p) => ({ userId, permissionKey: p.key, granted: p.granted })) }),
    prisma.userMetricOverride.deleteMany({ where: { userId } }),
    prisma.userMetricOverride.createMany({ data: input.metricOverrides.map((m) => ({ userId, metricKey: m.key, granted: m.granted })) }),
    prisma.user.update({
      where: { id: userId },
      data: {
        allAdAccounts: input.allAdAccounts, allCreators: input.allCreators, maxLookbackDays: input.maxLookbackDays,
        earliestDataDate: input.earliestDataDate ? new Date(`${input.earliestDataDate}T00:00:00Z`) : null,
      },
    }),
  ];
}

function accessSummary(input: AccessInput) {
  return {
    roleIds: input.roleIds, adAccountIds: input.adAccountIds, creatorIds: input.creatorIds,
    allAdAccounts: input.allAdAccounts, allCreators: input.allCreators, maxLookbackDays: input.maxLookbackDays,
    earliestDataDate: input.earliestDataDate, permissionOverrides: input.permissionOverrides, metricOverrides: input.metricOverrides,
  };
}

async function issueInvitation(userId: string, email: string, name: string, createdById: string | null) {
  const token = randomToken(32);
  await prisma.invitation.updateMany({ where: { userId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  await prisma.invitation.create({
    data: { userId, email, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000), createdById },
  });
  const url = `${env().APP_URL}/invite/${token}`;
  const { delivered } = await sendEmail({
    to: email,
    subject: "You're invited to the Suroskie Creative Performance Portal",
    text: `Hi ${name},\n\nYou have been invited to the Suroskie Creative Performance Portal. Set your password within ${INVITE_TTL_HOURS} hours:\n${url}\n`,
    html: simpleHtml("You're invited", [`Hi ${name},`, `You have been invited to the Suroskie Creative Performance Portal. This link expires in ${INVITE_TTL_HOURS} hours.`], { label: "Accept invitation", url }),
  });
  // The link is returned to the admin only when email delivery isn't configured.
  return { delivered, inviteUrl: delivered ? null : url };
}

export async function inviteUser(ctx: AccessContext, actor: AuditActor, raw: unknown) {
  const input = inviteSchema.parse(raw);
  await assertGrantable(ctx, input);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError("A user with this email already exists");
  const userId = randomUUID();
  await prisma.$transaction([
    prisma.user.create({ data: { id: userId, email: input.email, name: input.name, status: "INVITED" } }),
    ...accessWrite(userId, input),
  ]);
  const invite = await issueInvitation(userId, input.email, input.name, actor.userId);
  await audit(actor, "user.invited", `Invited ${input.email}`, { targetType: "user", targetId: userId, metadata: accessSummary(input) });
  return { userId, ...invite };
}

export async function resendInvitation(ctx: AccessContext, actor: AuditActor, userId: string) {
  const { target } = await assertCanManage(ctx, userId);
  if (target.status !== "INVITED") throw new ValidationError("This user has already accepted their invitation");
  const invite = await issueInvitation(userId, target.email, target.name, actor.userId);
  await audit(actor, "user.invitation_resent", `Re-sent invitation to ${target.email}`, { targetType: "user", targetId: userId });
  return invite;
}

export async function updateUserAccess(ctx: AccessContext, actor: AuditActor, userId: string, raw: unknown) {
  const input = accessSchema.parse(raw);
  const { target, isTargetSuper } = await assertCanManage(ctx, userId);
  const roles = await assertGrantable(ctx, input);
  if (isTargetSuper && !roles.some((r) => r.key === SUPER_ADMIN_ROLE)) await assertNotLastSuperAdmin(userId);
  if (userId === ctx.userId && isTargetSuper && !roles.some((r) => r.key === SUPER_ADMIN_ROLE)) {
    throw new ValidationError("You cannot remove your own Super Admin role");
  }
  const before = await snapshotAccess(userId);
  await prisma.$transaction(accessWrite(userId, input));
  await audit(actor, "user.access_updated", `Updated access for ${target.email}`, { targetType: "user", targetId: userId, metadata: { before, after: accessSummary(input) } });
}

async function snapshotAccess(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { roles: true, adAccountAccess: true, creatorAccess: true, permissionOverrides: true, metricOverrides: true },
  });
  return {
    roleIds: u.roles.map((r) => r.roleId), adAccountIds: u.adAccountAccess.map((a) => a.adAccountId), creatorIds: u.creatorAccess.map((c) => c.creatorId),
    allAdAccounts: u.allAdAccounts, allCreators: u.allCreators, maxLookbackDays: u.maxLookbackDays,
    earliestDataDate: u.earliestDataDate?.toISOString().slice(0, 10) ?? null,
    permissionOverrides: u.permissionOverrides.map((p) => ({ key: p.permissionKey, granted: p.granted })),
    metricOverrides: u.metricOverrides.map((m) => ({ key: m.metricKey, granted: m.granted })),
  };
}

async function assertNotLastSuperAdmin(userId: string) {
  const supers = await prisma.user.count({ where: { status: "ACTIVE", id: { not: userId }, roles: { some: { role: { key: SUPER_ADMIN_ROLE } } } } });
  if (supers === 0) throw new ValidationError("At least one active Super Admin must remain");
}

/** Suspend: immediately revokes every session; the user can no longer sign in. */
export async function suspendUser(ctx: AccessContext, actor: AuditActor, userId: string, reason?: string) {
  if (userId === ctx.userId) throw new ValidationError("You cannot suspend yourself");
  const { target, isTargetSuper } = await assertCanManage(ctx, userId);
  if (isTargetSuper) await assertNotLastSuperAdmin(userId);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status: "SUSPENDED", suspendedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.invitation.updateMany({ where: { userId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit(actor, "user.suspended", `Suspended ${target.email}`, { targetType: "user", targetId: userId, metadata: { reason: reason ?? null } });
}

export async function reactivateUser(ctx: AccessContext, actor: AuditActor, userId: string) {
  const { target } = await assertCanManage(ctx, userId);
  if (target.status !== "SUSPENDED") throw new ValidationError("User is not suspended");
  const hasPassword = await prisma.account.count({ where: { userId, providerId: "credential" } });
  await prisma.user.update({ where: { id: userId }, data: { status: hasPassword ? "ACTIVE" : "INVITED", suspendedAt: null } });
  await audit(actor, "user.reactivated", `Reactivated ${target.email}`, { targetType: "user", targetId: userId });
}

/** Revoke all of a user's sessions without suspending (forces re-login). */
export async function revokeSessions(ctx: AccessContext, actor: AuditActor, userId: string) {
  const { target } = await assertCanManage(ctx, userId);
  const r = await prisma.session.deleteMany({ where: { userId } });
  await audit(actor, "user.sessions_revoked", `Revoked ${r.count} session(s) for ${target.email}`, { targetType: "user", targetId: userId });
}

// ───────────── Invitation acceptance (public, token-gated) ─────────────

export const acceptSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`).max(128),
});

export async function findValidInvitation(token: string) {
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!inv || inv.revokedAt || inv.acceptedAt || inv.expiresAt < new Date() || inv.user.status !== "INVITED") return null;
  return inv;
}

export async function acceptInvitation(raw: unknown, meta: { ipAddress?: string | null; userAgent?: string | null }) {
  const input = acceptSchema.parse(raw);
  const inv = await findValidInvitation(input.token);
  if (!inv) throw new ValidationError("This invitation link is invalid or has expired. Ask an administrator for a new one.");
  const hash = await hashPassword(input.password);
  await prisma.$transaction([
    prisma.account.create({ data: { id: randomUUID(), accountId: inv.userId, providerId: "credential", userId: inv.userId, password: hash } }),
    prisma.user.update({ where: { id: inv.userId }, data: { status: "ACTIVE", name: input.name, emailVerified: true } }),
    prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } }),
  ]);
  await audit({ userId: inv.userId, email: inv.email, ...meta }, "user.invitation_accepted", `${inv.email} accepted their invitation`, { targetType: "user", targetId: inv.userId });
  return { email: inv.email };
}
