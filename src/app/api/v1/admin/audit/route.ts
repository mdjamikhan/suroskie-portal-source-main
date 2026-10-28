import { z } from "zod";
import { apiRoute } from "@/lib/http";
import { queryAuditLog } from "@/lib/audit-query";

const q = z.object({
  action: z.string().max(64).optional(),
  actor: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const GET = apiRoute(({ req }) => queryAuditLog(q.parse(Object.fromEntries(req.nextUrl.searchParams))), { permission: "audit.view" });
