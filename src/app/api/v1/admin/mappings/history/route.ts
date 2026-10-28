import { apiRoute } from "@/lib/http";
import { prisma } from "@/lib/db";
import { inScope } from "@/lib/access/context";
import { NotFoundError } from "@/lib/errors";

export const GET = apiRoute(async ({ req, ctx }) => {
  const adId = req.nextUrl.searchParams.get("adId") ?? "";
  const ad = await prisma.ad.findUnique({ where: { id: adId }, select: { adAccountId: true } });
  if (!ad || !inScope(ctx.adAccounts, ad.adAccountId)) throw new NotFoundError("Ad not found");
  const changes = await prisma.mappingChange.findMany({ where: { adId }, orderBy: { createdAt: "desc" }, take: 100 });
  const ids = [...new Set(changes.flatMap((c) => [c.previousCreatorId, c.newCreatorId]).filter((x): x is string => !!x))];
  const users = [...new Set(changes.map((c) => c.changedById).filter((x): x is string => !!x))];
  const [creators, people] = await Promise.all([
    prisma.creator.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, code: true } }),
    prisma.user.findMany({ where: { id: { in: users } }, select: { id: true, name: true, email: true } }),
  ]);
  const c = new Map(creators.map((x) => [x.id, x]));
  const u = new Map(people.map((x) => [x.id, x]));
  return changes.map((ch) => ({
    id: ch.id, at: ch.createdAt, method: ch.method, reason: ch.reason,
    from: ch.previousCreatorId ? c.get(ch.previousCreatorId) ?? null : null,
    to: ch.newCreatorId ? c.get(ch.newCreatorId) ?? null : null,
    by: ch.changedById ? u.get(ch.changedById)?.name ?? "Unknown" : "System (naming rule)",
  }));
}, { permission: "mapping.manage" });
