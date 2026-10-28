import { apiRoute } from "@/lib/http";
import { getCampaignReport } from "@/lib/reporting/service";

export const GET = apiRoute(({ req, ctx }) => {
  const l = req.nextUrl.searchParams.get("level");
  return getCampaignReport(ctx, req.nextUrl.searchParams, l === "adset" || l === "ad" ? l : "campaign");
}, { permission: "reports.campaigns" });
