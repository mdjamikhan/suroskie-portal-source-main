// Route-handler plumbing: authentication, authorization, CSRF origin checks, rate limiting and
// safe error responses. Internal error details are logged server-side and never returned.
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, ForbiddenError, TooManyRequestsError } from "@/lib/errors";
import { requireAccess } from "@/lib/auth/session";
import type { AccessContext } from "@/lib/access/context";
import type { PermissionKey } from "@/lib/access/permissions";
import type { AuditActor } from "@/lib/audit";

export function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

export function actorFor(req: Request, ctx: AccessContext): AuditActor {
  return { userId: ctx.userId, email: ctx.email, ipAddress: clientIp(req), userAgent: req.headers.get("user-agent") };
}

/** Reject cross-site state-changing requests (defence in depth on top of SameSite=Lax cookies). */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const allowed = new URL(env().APP_URL).origin;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (origin) {
    if (origin !== allowed) throw new ForbiddenError("Cross-origin request blocked");
    return;
  }
  if (site && site !== "same-origin" && site !== "none") throw new ForbiddenError("Cross-origin request blocked");
  if (!site) throw new ForbiddenError("Missing Origin header");
}

/**
 * Fixed-window rate limiter stored in Postgres (works across serverless instances).
 * Shares the rate_limit table with Better Auth under an "api:" key prefix.
 */
export async function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit (id, key, count, "lastRequest") VALUES (${`api-${key}`}, ${`api:${key}`}, 1, ${BigInt(now)})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit."lastRequest" < ${BigInt(now - windowMs)} THEN 1 ELSE rate_limit.count + 1 END,
      "lastRequest" = CASE WHEN rate_limit."lastRequest" < ${BigInt(now - windowMs)} THEN ${BigInt(now)} ELSE rate_limit."lastRequest" END
    RETURNING count`;
  if ((rows[0]?.count ?? 0) > max) throw new TooManyRequestsError();
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status, headers: { "Cache-Control": "no-store" } });
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid request", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  console.error("[api] unhandled error", e);
  return NextResponse.json({ error: { code: "internal_error", message: "Something went wrong. Please try again." } }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

type Handler<P> = (args: { req: NextRequest; ctx: AccessContext; params: P; actor: AuditActor }) => Promise<Response | unknown>;

/**
 * Wrap an authenticated API route. Every request re-validates the session and re-resolves the
 * user's access from the database, then (optionally) checks a permission and rate limit.
 */
export function apiRoute<P = Record<string, string>>(
  handler: Handler<P>,
  opts: { permission?: PermissionKey | PermissionKey[]; rateLimit?: { max: number; windowMs: number; bucket: string } } = {},
) {
  return async (req: NextRequest, segment: { params: Promise<P> }) => {
    try {
      assertSameOrigin(req);
      const ctx = await requireAccess(req.headers, opts.permission);
      const r = opts.rateLimit ?? (req.method === "GET" ? { max: 240, windowMs: 60_000, bucket: "read" } : { max: 60, windowMs: 60_000, bucket: "write" });
      await rateLimit(`${r.bucket}:${ctx.userId}`, r.max, r.windowMs);
      const params = (await segment.params) ?? ({} as P);
      const out = await handler({ req, ctx, params, actor: actorFor(req, ctx) });
      if (out instanceof Response) {
        out.headers.set("Cache-Control", "no-store");
        return out;
      }
      return NextResponse.json(out ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 1_000_000) throw new AppError("Request body too large", 413, "payload_too_large");
  try {
    return await req.json();
  } catch {
    throw new AppError("Request body must be valid JSON", 400, "invalid_json");
  }
}
