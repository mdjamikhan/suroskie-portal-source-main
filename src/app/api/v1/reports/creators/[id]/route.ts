import { apiRoute } from "@/lib/http";
import { getCreatorPerformance } from "@/lib/reporting/service";

export const GET = apiRoute<{ id: string }>(({ req, ctx, params }) => getCreatorPerformance(ctx, params.id, req.nextUrl.searchParams), {
  permission: "reports.creators",
});
