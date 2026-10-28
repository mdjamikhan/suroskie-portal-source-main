import { apiRoute } from "@/lib/http";
import { syncStatus } from "@/lib/reporting/service";

export const GET = apiRoute(({ ctx }) => syncStatus(ctx));
