import { apiRoute } from "@/lib/http";
import { prisma } from "@/lib/db";

export const GET = apiRoute(({ req, ctx }) => {
  const account = req.nextUrl.searchParams.get("account");
  const scope = ctx.adAccounts === "ALL" ? {} : { adAccountId: { in: ctx.adAccounts } };
  return prisma.syncJob.findMany({
    where: { ...scope, ...(account ? { adAccountId: account } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, type: true, trigger: true, status: true, dateFrom: true, dateTo: true, breakdownType: true, attempts: true, maxAttempts: true, runAfter: true, startedAt: true, finishedAt: true, errorCode: true, errorMessage: true, stats: true, createdAt: true, adAccount: { select: { name: true } } },
  });
}, { permission: "adaccounts.view" });
