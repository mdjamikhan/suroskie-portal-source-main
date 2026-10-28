import { z } from "zod";
import { apiRoute, readJson } from "@/lib/http";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export const GET = apiRoute(() => prisma.metricDefinition.findMany({ orderBy: { sortOrder: "asc" } }), { permission: "settings.manage" });

// Re-enable a metric after an API upgrade restored the underlying field (the next sync re-checks it).
const body = z.object({ key: z.string().max(64), isSupported: z.literal(true) });

export const PATCH = apiRoute(async ({ req, actor }) => {
  const { key } = body.parse(await readJson(req));
  await prisma.metricDefinition.update({ where: { key }, data: { isSupported: true, unsupportedReason: null } });
  await audit(actor, "metric.support_reset", `Reset support flag for metric ${key}`, { targetType: "metric", targetId: key });
  return { ok: true };
}, { permission: "settings.manage" });
