import { z } from "zod";
import { apiRoute, readJson } from "@/lib/http";
import { reactivateUser, resendInvitation, revokeSessions, suspendUser } from "@/lib/users/service";

const body = z.object({ action: z.enum(["suspend", "reactivate", "resend_invitation", "revoke_sessions"]), reason: z.string().max(300).optional() });

export const POST = apiRoute<{ id: string }>(async ({ req, ctx, actor, params }) => {
  const { action, reason } = body.parse(await readJson(req));
  switch (action) {
    case "suspend":
      await suspendUser(ctx, actor, params.id, reason);
      return { ok: true };
    case "reactivate":
      await reactivateUser(ctx, actor, params.id);
      return { ok: true };
    case "resend_invitation":
      return resendInvitation(ctx, actor, params.id);
    case "revoke_sessions":
      await revokeSessions(ctx, actor, params.id);
      return { ok: true };
  }
}, { permission: "users.manage" });
