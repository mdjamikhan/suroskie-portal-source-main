import { apiRoute, readJson } from "@/lib/http";
import { prisma } from "@/lib/db";
import { createRole } from "@/lib/users/roles";

export const GET = apiRoute(() =>
  prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], include: { permissions: true, metrics: true, _count: { select: { users: true } } } }),
{ permission: "users.manage" });

export const POST = apiRoute(async ({ req, ctx, actor }) => createRole(ctx, actor, await readJson(req)), { permission: "users.manage" });
