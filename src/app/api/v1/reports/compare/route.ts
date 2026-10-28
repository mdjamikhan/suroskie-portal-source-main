import { apiRoute } from "@/lib/http";
import { compareEntities } from "@/lib/reporting/service";

export const GET = apiRoute(({ req, ctx }) => {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") === "creator" ? "creator" : "ad";
  const ids = (sp.get("ids") ?? "").split(",").filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s));
  return compareEntities(ctx, sp, kind, ids);
});
