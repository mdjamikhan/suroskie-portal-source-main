import { apiRoute, readJson } from "@/lib/http";
import { prisma } from "@/lib/db";
import { assertCreatorAccess } from "@/lib/access/context";
import { createAsset } from "@/lib/creators/service";

export const GET = apiRoute(async ({ req, ctx }) => {
  const creatorId = req.nextUrl.searchParams.get("creatorId") ?? "";
  assertCreatorAccess(ctx, creatorId);
  return prisma.creativeAsset.findMany({ where: { creatorId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, creativeType: true, product: true, contentAngle: true, hook: true, tags: true, launchDate: true, notes: true } });
}, { permission: ["mapping.manage", "creators.manage"] });

export const POST = apiRoute(async ({ req, ctx, actor }) => createAsset(ctx, actor, await readJson(req)), { permission: ["creators.manage", "mapping.manage"] });
