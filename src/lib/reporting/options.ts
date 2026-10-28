import { prisma } from "@/lib/db";
import type { AccessContext } from "@/lib/access/context";
import { demoMode } from "./service";

/** Filter dropdown options, limited to what the viewer may see. */
export async function getFilterOptions(ctx: AccessContext) {
  const demo = demoMode();
  const accountWhere = { isDemo: demo, ...(ctx.adAccounts === "ALL" ? {} : { id: { in: ctx.adAccounts } }) };
  const creatorScoped = ctx.creators !== "ALL";
  const [accounts, campaigns, products] = await Promise.all([
    prisma.adAccount.findMany({ where: accountWhere, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.campaign.findMany({
      where: { adAccount: accountWhere, ...(creatorScoped ? { ads: { some: { mapping: { creatorId: { in: ctx.creators as string[] } } } } } : {}) },
      select: { id: true, name: true },
      orderBy: [{ effectiveStatus: "asc" }, { name: "asc" }],
      take: 300,
    }),
    prisma.creativeAsset.findMany({
      where: { product: { not: null }, ...(creatorScoped ? { creatorId: { in: ctx.creators as string[] } } : {}) },
      select: { product: true },
      distinct: ["product"],
      orderBy: { product: "asc" },
    }),
  ]);
  return { accounts, campaigns, products: products.map((p) => p.product!).filter(Boolean) };
}
