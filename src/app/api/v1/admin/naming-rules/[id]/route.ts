import { apiRoute, readJson } from "@/lib/http";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertGlobalMapper, namingRuleSchema } from "@/lib/mapping/queries";

export const PATCH = apiRoute<{ id: string }>(async ({ req, ctx, actor, params }) => {
  assertGlobalMapper(ctx);
  const input = namingRuleSchema.parse(await readJson(req));
  const rule = await prisma.namingRule.update({ where: { id: params.id }, data: input });
  await audit(actor, "naming_rule.updated", `Updated naming rule "${rule.name}"`, { targetType: "naming_rule", targetId: rule.id, metadata: input });
  return rule;
}, { permission: "mapping.manage" });

export const DELETE = apiRoute<{ id: string }>(async ({ ctx, actor, params }) => {
  assertGlobalMapper(ctx);
  const rule = await prisma.namingRule.delete({ where: { id: params.id } });
  await audit(actor, "naming_rule.deleted", `Deleted naming rule "${rule.name}"`, { targetType: "naming_rule", targetId: rule.id });
  return { ok: true };
}, { permission: "mapping.manage" });
