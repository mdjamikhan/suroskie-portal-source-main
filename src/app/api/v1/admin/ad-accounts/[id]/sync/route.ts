import { after } from "next/server";
import { z } from "zod";
import { apiRoute, readJson } from "@/lib/http";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertAdAccountAccess } from "@/lib/access/context";
import { requestManualSync } from "@/lib/sync/scheduler";
import { runWorker } from "@/lib/sync/worker";
import { isIsoDate, diffDays } from "@/lib/reporting/date-range";
import { ValidationError } from "@/lib/errors";

export const maxDuration = 300;

const body = z.object({
  from: z.string().refine(isIsoDate).optional(),
  to: z.string().refine(isIsoDate).optional(),
});

export const POST = apiRoute<{ id: string }>(async ({ req, ctx, actor, params }) => {
  assertAdAccountAccess(ctx, params.id);
  const input = body.parse(await readJson(req).catch(() => ({})));
  if ((input.from && !input.to) || (!input.from && input.to)) throw new ValidationError("Provide both from and to, or neither");
  if (input.from && input.to && (input.from > input.to || diffDays(input.from, input.to) > 1200)) throw new ValidationError("Invalid resync range");
  const acc = await prisma.adAccount.findUniqueOrThrow({ where: { id: params.id } });
  if (acc.isDemo) throw new ValidationError("Demo accounts hold synthetic data and are never synced with Meta");
  if (!acc.syncEnabled) throw new ValidationError("Enable sync for this account first");
  const r = await requestManualSync(acc.id, ctx.userId, input.from && input.to ? { from: input.from, to: input.to } : undefined);
  await audit(actor, "sync.manual", `Requested manual sync for ${acc.name}`, { targetType: "ad_account", targetId: acc.id, metadata: { ...r, from: input.from ?? null, to: input.to ?? null } });
  // Start processing right away; the cron worker picks up anything left over.
  after(() => runWorker({ budgetMs: 240_000, accountIds: [acc.id] }).catch((e) => console.error("[sync] background run failed", e)));
  return r;
}, { permission: "sync.trigger", rateLimit: { max: 10, windowMs: 60_000, bucket: "manual-sync" } });
