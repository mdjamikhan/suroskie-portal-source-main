// Data Access Layer for the signed-in user. Every page, route handler and export goes through
// `requireAccess()` — the session is validated and the user's access re-resolved from the
// database on every request (no caching), so revocations and suspensions apply immediately.
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { loadAccessContext } from "@/lib/access/load";
import type { AccessContext } from "@/lib/access/context";
import { requirePermission } from "@/lib/access/context";
import type { PermissionKey } from "@/lib/access/permissions";
import { AppError, UnauthorizedError } from "@/lib/errors";

export async function getSessionUserId(h?: Headers): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: h ?? (await headers()) });
  return session?.user.id ?? null;
}

/** For route handlers: throws 401/403 AppErrors. */
export async function requireAccess(h?: Headers, permission?: PermissionKey | PermissionKey[]): Promise<AccessContext> {
  const userId = await getSessionUserId(h);
  if (!userId) throw new UnauthorizedError();
  const ctx = await loadAccessContext(userId);
  if (permission) requirePermission(ctx, permission);
  return ctx;
}

/** For server components: redirects instead of throwing. */
export async function pageAccess(permission?: PermissionKey | PermissionKey[]): Promise<AccessContext> {
  try {
    return await requireAccess(undefined, permission);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/login");
    if (e instanceof AppError && e.status === 403) redirect("/forbidden");
    throw e;
  }
}
