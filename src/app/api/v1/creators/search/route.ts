import { apiRoute } from "@/lib/http";
import { searchCreators } from "@/lib/reporting/service";

export const GET = apiRoute(({ req, ctx }) => searchCreators(ctx, req.nextUrl.searchParams.get("q") ?? ""));
