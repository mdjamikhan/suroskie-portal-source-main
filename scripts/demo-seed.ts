// Usage: npm run demo:seed            (refuses if real ad accounts exist)
//        npm run demo:seed -- --force (seed anyway; demo data stays isolated by isDemo)
//        npm run demo:clear
import "dotenv/config";
import { prisma } from "@/lib/db";
import { clearDemoData, demoDataBlocked, seedDemoData } from "@/lib/demo/generate";

async function main() {
  if (process.argv.includes("--clear")) {
    await clearDemoData(prisma);
    console.log("✓ Demo data removed");
    return;
  }
  if ((await demoDataBlocked(prisma)) && !process.argv.includes("--force")) {
    console.error("Real (non-demo) ad accounts exist. Refusing to add demo data. Pass --force to override.");
    process.exitCode = 1;
    return;
  }
  const r = await seedDemoData(prisma);
  console.log(`✓ DEMO data created: ${r.creators} creators, ${r.ads} ads, ${r.insightRows} daily insight rows, ${r.breakdownRows} breakdown rows (${r.mappedByRule} ads mapped by naming rule).`);
  console.log("  Set DEMO_MODE=true to view it. Demo data is synthetic and is never shown alongside real Meta data.");
}

main().finally(() => prisma.$disconnect());
