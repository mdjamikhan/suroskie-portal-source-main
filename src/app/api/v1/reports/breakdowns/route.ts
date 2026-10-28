import { apiRoute } from "@/lib/http";
import { BREAKDOWN_TYPES, getBreakdown, type BreakdownKey } from "@/lib/reporting/service";
import { ValidationError } from "@/lib/errors";

export const GET = apiRoute(({ req, ctx }) => {
  const type = req.nextUrl.searchParams.get("type") ?? "AGE_GENDER";
  if (!(type in BREAKDOWN_TYPES)) throw new ValidationError("Unknown breakdown type");
  return getBreakdown(ctx, req.nextUrl.searchParams, type as BreakdownKey);
}, { permission: "reports.breakdowns" });
