import { z } from "zod";
import { apiRoute, readJson } from "@/lib/http";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { discoverAdAccounts, revalidateConnection } from "@/lib/meta/connection";
import { cancelQueuedJobs } from "@/lib/sync/queue";
import { ValidationError } from "@/lib/errors";

const body = z.object({ action: z.enum(["validate", "discover"]) });

export const POST = apiRoute<{ id: string }>(async ({ req, actor, params }) => {
  const { action } = body.parse(await readJson(req));
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { id: params.id }, select: { id: true, isDemo: true, label: true } });
  if (conn.isDemo) throw new ValidationError("The demo connection is synthetic and cannot contact Meta");
  if (action === "validate") {
    const r = await revalidateConnection(conn.id);
    await audit(actor, "meta.connection_validated", `Validated Meta connection ${conn.label}: ${r.status}`, { targetType: "meta_connection", targetId: conn.id });
    return { status: r.status, lastError: r.lastError };
  }
  const accounts = await discoverAdAccounts(conn.id);
  await audit(actor, "meta.accounts_discovered", `Discovered ${accounts.length} ad account(s) via ${conn.label}`, { targetType: "meta_connection", targetId: conn.id });
  return { discovered: accounts.length };
}, { permission: "integrations.manage" });

/** Disconnect: delete the encrypted token and stop syncing its accounts. Historical data is kept. */
export const DELETE = apiRoute<{ id: string }>(async ({ actor, params }) => {
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { id: params.id }, include: { adAccounts: { select: { id: true } } } });
  for (const a of conn.adAccounts) await cancelQueuedJobs(a.id);
  await prisma.$transaction([
    prisma.adAccount.updateMany({ where: { connectionId: conn.id }, data: { syncEnabled: false, syncHealth: "FAILING", lastSyncError: "Meta connection was removed" } }),
    prisma.metaConnection.delete({ where: { id: conn.id } }),
  ]);
  await audit(actor, "meta.connection_removed", `Removed Meta connection ${conn.label}`, { targetType: "meta_connection", targetId: conn.id, metadata: { accounts: conn.adAccounts.length } });
  return { ok: true };
}, { permission: "integrations.manage" });
