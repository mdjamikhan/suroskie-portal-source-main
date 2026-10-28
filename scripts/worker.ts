// Long-running sync worker for self-hosted deployments (Railway, Render, Fly, a VM, Docker).
// On Vercel, use the authenticated cron endpoints (scheduled via GitHub Actions).
//   npm run worker          — runs forever: schedules hourly, drains the queue continuously
//   npm run sync:once       — schedule + drain once, then exit (useful for cron or testing)
import "dotenv/config";
import { prisma } from "@/lib/db";
import { runRetention, scheduleSync } from "@/lib/sync/scheduler";
import { runWorker } from "@/lib/sync/worker";

const once = process.argv.includes("--once");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

async function main() {
  let lastSchedule = 0;
  let lastRetention = 0;
  do {
    if (Date.now() - lastSchedule > 15 * 60_000) {
      const s = await scheduleSync();
      console.log(`[scheduler] ${s.accounts} account(s), ${s.enqueued} job(s) enqueued, ${s.recovered} recovered`);
      lastSchedule = Date.now();
    }
    if (Date.now() - lastRetention > 24 * 3_600_000) {
      console.log("[retention]", await runRetention());
      lastRetention = Date.now();
    }
    const w = await runWorker({ budgetMs: 5 * 60_000 });
    if (w.processed) console.log(`[worker] processed ${w.processed}: ${w.succeeded} ok, ${w.requeued} requeued, ${w.failed} failed`);
    if (once && w.stoppedBecause === "no_jobs") break;
    if (!w.processed) await sleep(30_000);
  } while (!stopping);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
