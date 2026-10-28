import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { intersectScope, type AccessContext } from "@/lib/access/context";
import { demoMode } from "@/lib/reporting/service";
import { ForbiddenError } from "@/lib/errors";

export const namingRuleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  source: z.enum(["AD_NAME", "ADSET_NAME", "CAMPAIGN_NAME"]),
  matchField: z.enum(["CREATOR_CODE", "INSTAGRAM_HANDLE"]),
  prefix: z.string().max(20).regex(/^[A-Za-z0-9@_\-.#]*$/, "Prefix may contain letters, numbers and @ _ - . #").default(""),
  priority: z.number().int().min(0).max(10_000).default(100),
  enabled: z.boolean().default(true),
});

export interface MappingListQuery {
  status: "all" | "unmapped" | "mapped";
  account?: string;
  creator?: string;
  q?: string;
  page: number;
  pageSize: number;
}

/** Ads for the mapping workspace, limited to the admin's ad-account scope. */
export async function listAdsForMapping(ctx: AccessContext, q: MappingListQuery) {
  const accounts = intersectScope(ctx.adAccounts, q.account ? [q.account] : undefined);
  const where: Prisma.AdWhereInput = {
    adAccount: { isDemo: demoMode(), ...(accounts === "ALL" ? {} : { id: { in: accounts } }) },
    ...(q.status === "unmapped" ? { mapping: null } : q.status === "mapped" ? { mapping: { isNot: null } } : {}),
    ...(q.creator ? { mapping: { creatorId: q.creator } } : {}),
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { metaAdId: q.q }, { campaign: { name: { contains: q.q, mode: "insensitive" } } }] } : {}),
  };
  // Mapping admins with a restricted creator scope only see unmapped ads and their own creators' ads.
  if (ctx.creators !== "ALL") {
    where.AND = [{ OR: [{ mapping: null }, { mapping: { creatorId: { in: ctx.creators } } }] }];
  }
  const [total, unmappedTotal, ads] = await Promise.all([
    prisma.ad.count({ where }),
    prisma.ad.count({ where: { adAccount: where.adAccount, mapping: null } }),
    prisma.ad.findMany({
      where,
      orderBy: [{ metaCreatedTime: { sort: "desc", nulls: "last" } }, { name: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true, metaAdId: true, name: true, effectiveStatus: true, metaCreatedTime: true, metaCreativeId: true,
        adAccount: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
        adSet: { select: { id: true, name: true } },
        creative: { select: { thumbnailUrl: true, creativeType: true } },
        mapping: { select: { method: true, updatedAt: true, creator: { select: { id: true, name: true, code: true } }, creativeAsset: { select: { id: true, title: true } } } },
      },
    }),
  ]);
  return { total, unmappedTotal, page: q.page, pageSize: q.pageSize, rows: ads };
}

/** Naming rules map ads across every account, so managing them requires unrestricted scope. */
export function assertGlobalMapper(ctx: AccessContext) {
  if (ctx.adAccounts !== "ALL" || ctx.creators !== "ALL") throw new ForbiddenError("Naming rules require access to all ad accounts and creators");
}
