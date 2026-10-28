import { apiRoute } from "@/lib/http";
import { listCreators } from "@/lib/reporting/service";

export const GET = apiRoute(({ req, ctx }) => listCreators(ctx, req.nextUrl.searchParams), { permission: "reports.creators" });
