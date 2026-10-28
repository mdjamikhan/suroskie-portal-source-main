import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runRetention, scheduleSync } from "@/lib/sync/scheduler";
import { runWorker } from "@/lib/sync/worker";
import { errorResponse } from "@/lib/http";

export const maxDuration = 300;

/**
 * Scheduled sync entry point. Authenticated with CRON_SECRET via the Authorization header.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!safeEqual(auth, `Bearer ${env().CRON_SECRET}`)) return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
    const schedule = await scheduleSync();
    const retention = await runRetention();
    const worker = await runWorker({ budgetMs: Math.min(env().WORKER_TIME_BUDGET_MS, 270_000) });
    return NextResponse.json({ schedule, retention, worker }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
