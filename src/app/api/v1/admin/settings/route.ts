import { apiRoute, readJson } from "@/lib/http";
import { audit } from "@/lib/audit";
import { getSettings, settingsSchema, updateSettings } from "@/lib/settings";

export const GET = apiRoute(() => getSettings(), { permission: "settings.manage" });

export const PATCH = apiRoute(async ({ req, ctx, actor }) => {
  const patch = settingsSchema.partial().parse(await readJson(req));
  const before = await getSettings();
  const after = await updateSettings(patch, ctx.userId);
  await audit(actor, "settings.updated", `Updated settings: ${Object.keys(patch).join(", ")}`, { metadata: { before, after } });
  return after;
}, { permission: "settings.manage" });
