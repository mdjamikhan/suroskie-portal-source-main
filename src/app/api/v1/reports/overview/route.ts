import { apiRoute } from "@/lib/http";
import { getOverview } from "@/lib/reporting/service";

export const GET = apiRoute(({ req, ctx }) => getOverview(ctx, req.nextUrl.searchParams), { permission: "reports.overview" });
