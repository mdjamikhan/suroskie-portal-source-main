import { NextResponse, type NextRequest } from "next/server";
import { requireAccess } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { metaAppConfigured, env } from "@/lib/env";
import { oauthDialogUrl } from "@/lib/meta/connection";
import { randomToken } from "@/lib/crypto";
import { ValidationError } from "@/lib/errors";

const OAUTH_STATE_COOKIE = "suroskie_meta_oauth_state";

export async function GET(req: NextRequest) {
  try {
    await requireAccess(req.headers, "integrations.manage");
    if (!metaAppConfigured()) throw new ValidationError("Set META_APP_ID and META_APP_SECRET first");
    const state = randomToken(24);
    const res = NextResponse.redirect(oauthDialogUrl(state, env().META_LOGIN_CONFIG_ID || undefined));
    res.cookies.set(OAUTH_STATE_COOKIE, state, { httpOnly: true, secure: env().APP_URL.startsWith("https://"), sameSite: "lax", path: "/api/v1/admin/meta/oauth", maxAge: 600 });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
