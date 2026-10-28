import { apiRoute, readJson } from "@/lib/http";
import { deleteRole, updateRole } from "@/lib/users/roles";

export const PATCH = apiRoute<{ id: string }>(async ({ req, ctx, actor, params }) => {
  await updateRole(ctx, actor, params.id, await readJson(req));
  return { ok: true };
}, { permission: "users.manage" });

export const DELETE = apiRoute<{ id: string }>(async ({ ctx, actor, params }) => {
  await deleteRole(ctx, actor, params.id);
  return { ok: true };
}, { permission: "users.manage" });
