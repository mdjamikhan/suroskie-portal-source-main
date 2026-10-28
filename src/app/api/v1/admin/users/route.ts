import { apiRoute, readJson } from "@/lib/http";
import { prisma } from "@/lib/db";
import { inviteUser } from "@/lib/users/service";

export const GET = apiRoute(() =>
  prisma.user.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true, roles: { select: { role: { select: { id: true, name: true, key: true } } } } },
  }),
{ permission: "users.manage" });

export const POST = apiRoute(async ({ req, ctx, actor }) => inviteUser(ctx, actor, await readJson(req)), { permission: "users.manage" });
