import { apiRoute, readJson } from "@/lib/http";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertGlobalMapper, namingRuleSchema } from "@/lib/mapping/queries";

export const GET = apiRoute(() => prisma.namingRule.findMany({ orderBy: { priority: "asc" } }), { permission: "mapping.manage" });

export const POST = apiRoute(async ({ req, ctx, actor }) => {
  assertGlobalMapper(ctx);
  const input = namingRuleSchema.parse(await readJson(req));
  const rule = await prisma.namingRule.create({ data: input });
  await audit(actor, "naming_rule.created", `Created naming rule "${rule.name}"`, { targetType: "naming_rule", targetId: rule.id, metadata: input });
  return rule;
}, { permission: "mapping.manage" });
