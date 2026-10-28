import { z } from "zod";
import { apiRoute, readJson } from "@/lib/http";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createConnection, discoverAdAccounts } from "@/lib/meta/connection";

// The encrypted token column is never selected into API responses.
export const GET = apiRoute(() =>
  prisma.metaConnection.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, authType: true, metaUserName: true, scopes: true, tokenExpiresAt: true, dataAccessExpiresAt: true, status: true, lastValidatedAt: true, lastError: true, isDemo: true, createdAt: true, _count: { select: { adAccounts: true } } },
  }),
{ permission: "integrations.manage" });

const body = z.object({
  label: z.string().trim().min(2).max(80),
  // Accepted once over TLS, encrypted immediately, never returned.
  accessToken: z.string().trim().min(20).max(1000).regex(/^[A-Za-z0-9|_\-.]+$/, "That doesn't look like a Meta access token"),
});

export const POST = apiRoute(async ({ req, ctx, actor }) => {
  const input = body.parse(await readJson(req));
  const conn = await createConnection({ label: input.label, accessToken: input.accessToken, authType: "SYSTEM_USER_TOKEN", createdById: ctx.userId });
  await audit(actor, "meta.connection_created", `Connected Meta (${input.label}) as ${conn.metaUserName ?? "unknown user"}`, { targetType: "meta_connection", targetId: conn.id, metadata: { scopes: conn.scopes } });
  const accounts = await discoverAdAccounts(conn.id);
  return { connection: conn, discoveredAccounts: accounts.length };
}, { permission: "integrations.manage", rateLimit: { max: 10, windowMs: 60_000, bucket: "meta-connect" } });
