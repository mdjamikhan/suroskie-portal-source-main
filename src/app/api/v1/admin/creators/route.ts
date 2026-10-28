import { apiRoute, readJson } from "@/lib/http";
import { createCreator } from "@/lib/creators/service";

export const POST = apiRoute(async ({ req, ctx, actor }) => createCreator(ctx, actor, await readJson(req)), { permission: "creators.manage" });
