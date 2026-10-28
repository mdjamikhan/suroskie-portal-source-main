import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export interface AuditActor {
  userId: string | null;
  email: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const SYSTEM_ACTOR: AuditActor = { userId: null, email: "system" };

/**
 * Append-only audit trail for sensitive actions. Never put secrets (tokens, passwords) in
 * `metadata`; callers pass identifiers and before/after summaries only.
 */
export async function audit(
  actor: AuditActor,
  action: string,
  summary: string,
  opts: { targetType?: string; targetId?: string; metadata?: Prisma.InputJsonValue } = {},
  tx: Prisma.TransactionClient = prisma,
) {
  await tx.auditLog.create({
    data: {
      actorId: actor.userId,
      actorEmail: actor.email,
      action,
      summary,
      targetType: opts.targetType,
      targetId: opts.targetId,
      metadata: opts.metadata,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent?.slice(0, 300) ?? null,
    },
  });
}
