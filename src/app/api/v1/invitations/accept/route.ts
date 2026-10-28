import { NextResponse, type NextRequest } from "next/server";
import { acceptInvitation } from "@/lib/users/service";
import { assertSameOrigin, clientIp, errorResponse, rateLimit, readJson } from "@/lib/http";

// Public (token-gated) endpoint: the invitation token is the credential.
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    await rateLimit(`invite-accept:${clientIp(req) ?? "unknown"}`, 10, 15 * 60_000);
    const result = await acceptInvitation(await readJson(req), { ipAddress: clientIp(req), userAgent: req.headers.get("user-agent") });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
