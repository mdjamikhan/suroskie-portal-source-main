import "dotenv/config";
import { prisma } from "@/lib/db";
import { ensureInitialAdmin, seedReferenceData } from "@/lib/bootstrap";

async function main() {
  await seedReferenceData(prisma);
  console.log("✓ Permissions, metric catalogue and default roles seeded");
  const r = await ensureInitialAdmin(prisma, process.env.INITIAL_ADMIN_EMAIL, process.env.INITIAL_ADMIN_PASSWORD, process.env.INITIAL_ADMIN_NAME);
  console.log(r.created ? `✓ Initial Super Admin created: ${r.email}` : `• ${r.reason}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
