import { z } from "zod";
import { apiRoute, readJson } from "@/lib/http";
import { assignAds } from "@/lib/mapping/service";

const body = z.object({
  adIds: z.array(z.string().min(1).max(64)).min(1).max(1000),
  creatorId: z.string().min(1).max(64).nullable(),
  creativeAssetId: z.string().min(1).max(64).nullable().optional(),
  reason: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const POST = apiRoute(async ({ req, ctx, actor }) => {
  const input = body.parse(await readJson(req));
  return assignAds(ctx, actor, { ...input, method: input.adIds.length > 1 ? "BULK" : "MANUAL" });
}, { permission: "mapping.manage" });
