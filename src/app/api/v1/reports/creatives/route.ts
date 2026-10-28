import { apiRoute } from "@/lib/http";
import { getCreatives } from "@/lib/reporting/service";

export const GET = apiRoute(
  ({ req, ctx }) => getCreatives(ctx, req.nextUrl.searchParams, req.nextUrl.searchParams.get("dimension") === "creator" ? "creator" : "ad"),
  { permission: "reports.creatives" },
);
