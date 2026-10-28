import { NextResponse, type NextRequest } from "next/server";
import { requireAccess } from "@/lib/auth/session";
import { actorFor } from "@/lib/http";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { createConnection, discoverAdAccounts, exchangeOAuthCode } from "@/lib/meta/connection";
import { MetaApiError } from "@/lib/meta/errors";
import { AppError } from "@/lib/errors";

const STATE_COOKIE = "suroskie_meta_oauth_state";

function back(message: string, ok: boolean) {
  const u = new URL("/integrations", env().APP_URL);
  u.searchParams.set(ok ? "connected" : "error", message.slice(0, 200));
  const res = NextResponse.redirect(u);
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/v1/admin/meta/oauth" });
  return res;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAccess(req.headers, "integrations.manage");
    const sp = req.nextUrl.searchParams;
    const expected = req.cookies.get(STATE_COOKIE)?.value;
    const state = sp.get("state") ?? "";
    // CSRF protection for the OAuth flow.
    if (!expected || !safeEqual(expected, state)) return back("The Meta sign-in could not be verified (state mismatch). Please try again.", false);
    if (sp.get("error")) return back(sp.get("error_description") ?? "Meta sign-in was cancelled", false);
    const code = sp.get("code");
    if (!code) return back("Meta did not return an authorisation code", false);
    const token = await exchangeOAuthCode(code);
    const conn = await createConnection({ label: "Facebook Login", accessToken: token, authType: "OAUTH_USER_TOKEN", createdById: ctx.userId });
    await audit(actorFor(req, ctx), "meta.connection_created", `Connected Meta via Facebook Login as ${conn.metaUserName ?? "unknown"}`, { targetType: "meta_connection", targetId: conn.id, metadata: { scopes: conn.scopes } });
    const accounts = await discoverAdAccounts(conn.id);
    return back(`Connected. ${accounts.length} ad account(s) discovered — choose which to sync.`, true);
  } catch (e) {
    const msg = e instanceof MetaApiError ? e.message : e instanceof AppError ? e.message : "Connecting to Meta failed";
    if (!(e instanceof AppError) && !(e instanceof MetaApiError)) console.error("[meta-oauth]", e);
    return back(msg, false);
  }
}
