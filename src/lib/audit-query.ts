import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function queryAuditLog(q: { action?: string; actor?: string; page: number; pageSize?: number }) {
  const pageSize = q.pageSize ?? 50;
  const where: Prisma.AuditLogWhereInput = {
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.actor ? { actorEmail: { contains: q.actor, mode: "insensitive" } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, page: q.page, pageSize, rows };
}
