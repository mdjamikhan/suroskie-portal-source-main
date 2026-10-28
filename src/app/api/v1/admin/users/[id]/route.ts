import { apiRoute, readJson } from "@/lib/http";
import { updateUserAccess } from "@/lib/users/service";

export const PATCH = apiRoute<{ id: string }>(async ({ req, ctx, actor, params }) => {
  await updateUserAccess(ctx, actor, params.id, await readJson(req));
  return { ok: true };
}, { permission: "users.manage" });
