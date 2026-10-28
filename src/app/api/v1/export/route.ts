import { apiRoute } from "@/lib/http";
import { buildExport, EXPORT_KINDS, type ExportKind } from "@/lib/reporting/export";
import { ValidationError } from "@/lib/errors";

export const GET = apiRoute(
  async ({ req, ctx, actor }) => {
    const kind = req.nextUrl.searchParams.get("kind") as ExportKind;
    if (!EXPORT_KINDS.includes(kind)) throw new ValidationError("Unknown export type");
    const { filename, body } = await buildExport(ctx, actor, kind, req.nextUrl.searchParams);
    return new Response(body, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "X-Content-Type-Options": "nosniff" },
    });
  },
  { permission: "reports.export", rateLimit: { max: 20, windowMs: 60_000, bucket: "export" } },
);
