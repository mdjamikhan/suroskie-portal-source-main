import { z } from "zod";
import { apiRoute, readJson } from "@/lib/http";
import { applyNamingRules } from "@/lib/mapping/service";
import { ForbiddenError } from "@/lib/errors";

const body = z.object({ dryRun: z.boolean().default(true) });

export const POST = apiRoute(async ({ req, ctx, actor }) => {
  // Rules map across every account, so they require unrestricted account and creator scope.
  if (ctx.adAccounts !== "ALL" || ctx.creators !== "ALL") throw new ForbiddenError("Applying naming rules requires access to all ad accounts and creators");
  const { dryRun } = body.parse(await readJson(req));
  return applyNamingRules({ actor, dryRun });
}, { permission: "mapping.manage" });
