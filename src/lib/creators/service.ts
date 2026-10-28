import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { audit, type AuditActor } from "@/lib/audit";
import { assertCreatorAccess, requirePermission, type AccessContext } from "@/lib/access/context";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { isIsoDate } from "@/lib/reporting/date-range";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const creatorSchema = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only"),
  name: z.string().trim().min(1).max(120),
  instagramHandle: optionalText(60).transform((v) => (v ? v.replace(/^@/, "").toLowerCase() : null)).refine((v) => !v || /^[a-z0-9._]+$/.test(v), "Invalid Instagram handle"),
  profileImageUrl: optionalText(500).refine((v) => !v || /^https:\/\//.test(v), "Must be an https:// URL"),
  notes: optionalText(2000),
  isActive: z.boolean().default(true),
  team: optionalText(80),
  ownerUserId: z.string().max(64).optional().nullable().transform((v) => v || null),
});

export const assetSchema = z.object({
  creatorId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(160),
  creativeType: z.enum(["VIDEO", "IMAGE", "CAROUSEL", "OTHER", "UNKNOWN"]).default("UNKNOWN"),
  contentAngle: optionalText(120),
  hook: optionalText(300),
  product: optionalText(120),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  launchDate: z.string().refine(isIsoDate, "Use YYYY-MM-DD").optional().nullable(),
  notes: optionalText(2000),
});

function uniqueViolation(e: unknown, what: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ConflictError(`${what} is already in use`);
  throw e;
}

export async function createCreator(ctx: AccessContext, actor: AuditActor, raw: unknown) {
  requirePermission(ctx, "creators.manage");
  if (ctx.creators !== "ALL") throw new ValidationError("Creating creators requires access to all creators");
  const input = creatorSchema.parse(raw);
  const c = await prisma.creator.create({ data: { ...input, code: input.code.toUpperCase() } }).catch((e) => uniqueViolation(e, "Creator ID or Instagram handle"));
  await audit(actor, "creator.created", `Created creator ${c.name} (${c.code})`, { targetType: "creator", targetId: c.id });
  return c;
}

export async function updateCreator(ctx: AccessContext, actor: AuditActor, id: string, raw: unknown) {
  requirePermission(ctx, "creators.manage");
  assertCreatorAccess(ctx, id);
  const before = await prisma.creator.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("Creator not found");
  const input = creatorSchema.parse(raw);
  const c = await prisma.creator.update({ where: { id }, data: { ...input, code: input.code.toUpperCase() } }).catch((e) => uniqueViolation(e, "Creator ID or Instagram handle"));
  await audit(actor, "creator.updated", `Updated creator ${c.name} (${c.code})`, { targetType: "creator", targetId: id, metadata: { before: { code: before.code, name: before.name, isActive: before.isActive, ownerUserId: before.ownerUserId }, after: { code: c.code, name: c.name, isActive: c.isActive, ownerUserId: c.ownerUserId } } });
  return c;
}

export async function createAsset(ctx: AccessContext, actor: AuditActor, raw: unknown) {
  requirePermission(ctx, ["creators.manage", "mapping.manage"]);
  const input = assetSchema.parse(raw);
  assertCreatorAccess(ctx, input.creatorId);
  const a = await prisma.creativeAsset.create({ data: { ...input, launchDate: input.launchDate ? new Date(`${input.launchDate}T00:00:00Z`) : null } });
  await audit(actor, "asset.created", `Created creative asset "${a.title}"`, { targetType: "creative_asset", targetId: a.id, metadata: { creatorId: a.creatorId } });
  return a;
}

export async function updateAsset(ctx: AccessContext, actor: AuditActor, id: string, raw: unknown) {
  requirePermission(ctx, ["creators.manage", "mapping.manage"]);
  const existing = await prisma.creativeAsset.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Asset not found");
  assertCreatorAccess(ctx, existing.creatorId);
  const input = assetSchema.parse(raw);
  assertCreatorAccess(ctx, input.creatorId);
  if (input.creatorId !== existing.creatorId) {
    const mapped = await prisma.adCreatorMapping.count({ where: { creativeAssetId: id } });
    if (mapped) throw new ValidationError("This asset is linked to ads; reassign those ads before moving it to another creator");
  }
  const a = await prisma.creativeAsset.update({ where: { id }, data: { ...input, launchDate: input.launchDate ? new Date(`${input.launchDate}T00:00:00Z`) : null } });
  await audit(actor, "asset.updated", `Updated creative asset "${a.title}"`, { targetType: "creative_asset", targetId: id });
  return a;
}
