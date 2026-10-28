import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runWorker } from "@/lib/sync/worker";
import { errorResponse } from "@/lib/http";

export const maxDuration = 300;

/** Queue drain (scheduled every 5 minutes) so backfills progress between sync schedules. */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!safeEqual(auth, `Bearer ${env().CRON_SECRET}`)) return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
    const worker = await runWorker({ budgetMs: Math.min(env().WORKER_TIME_BUDGET_MS, 270_000) });
    return NextResponse.json({ worker }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
