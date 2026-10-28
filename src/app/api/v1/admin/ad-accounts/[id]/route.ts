import { z } from "zod";
import { apiRoute, readJson } from "@/lib/http";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { cancelQueuedJobs } from "@/lib/sync/queue";
import { ValidationError } from "@/lib/errors";

const body = z.object({ syncEnabled: z.boolean() });

export const PATCH = apiRoute<{ id: string }>(async ({ req, actor, params }) => {
  const { syncEnabled } = body.parse(await readJson(req));
  const acc = await prisma.adAccount.findUniqueOrThrow({ where: { id: params.id }, include: { connection: { select: { status: true } } } });
  if (syncEnabled && !acc.isDemo && acc.connection?.status !== "ACTIVE") throw new ValidationError("This account's Meta connection is not active. Reconnect it first.");
  await prisma.adAccount.update({ where: { id: acc.id }, data: { syncEnabled } });
  if (!syncEnabled) await cancelQueuedJobs(acc.id);
  await audit(actor, syncEnabled ? "adaccount.sync_enabled" : "adaccount.sync_disabled", `${syncEnabled ? "Enabled" : "Disabled"} sync for ${acc.name}`, { targetType: "ad_account", targetId: acc.id });
  return { ok: true };
}, { permission: "integrations.manage" });
