import { apiRoute, readJson } from "@/lib/http";
import { updateAsset } from "@/lib/creators/service";

export const PATCH = apiRoute<{ id: string }>(async ({ req, ctx, actor, params }) => updateAsset(ctx, actor, params.id, await readJson(req)), {
  permission: ["creators.manage", "mapping.manage"],
});
