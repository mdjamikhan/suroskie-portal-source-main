import { apiRoute, readJson } from "@/lib/http";
import { updateCreator } from "@/lib/creators/service";

export const PATCH = apiRoute<{ id: string }>(async ({ req, ctx, actor, params }) => updateCreator(ctx, actor, params.id, await readJson(req)), {
  permission: "creators.manage",
});
