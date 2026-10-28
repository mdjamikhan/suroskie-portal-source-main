import { z } from "zod";
import { apiRoute } from "@/lib/http";
import { listAdsForMapping } from "@/lib/mapping/queries";

const q = z.object({
  status: z.enum(["all", "unmapped", "mapped"]).default("all"),
  account: z.string().max(64).optional(),
  creator: z.string().max(64).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = apiRoute(({ req, ctx }) => listAdsForMapping(ctx, q.parse(Object.fromEntries(req.nextUrl.searchParams))), { permission: "mapping.manage" });
