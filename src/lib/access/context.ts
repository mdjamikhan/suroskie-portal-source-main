// Effective access resolution. Pure: given the user's roles, overrides and assignments,
// compute exactly what they may see. Every report query and export is built from this.
import { METRIC_KEYS } from "@/lib/metrics/catalog";
import { PERMISSION_KEYS, SUPER_ADMIN_ROLE, isPermissionKey, type PermissionKey } from "./permissions";
import { ForbiddenError } from "@/lib/errors";

export type Scope = "ALL" | string[];

export interface AccessContext {
  userId: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  roleKeys: string[];
  permissions: ReadonlySet<PermissionKey>;
  metrics: ReadonlySet<string>;
  /** Internal AdAccount ids the user may see, or ALL. */
  adAccounts: Scope;
  /** Creator ids the user may see, or ALL (ALL also includes unmapped ads). */
  creators: Scope;
  /** Unlimited when null. */
  maxLookbackDays: number | null;
  /** Hard floor (YYYY-MM-DD) set by an admin, or null. */
  earliestDataDate: string | null;
}

export interface AccessInput {
  user: {
    id: string;
    email: string;
    name: string;
    status: "INVITED" | "ACTIVE" | "SUSPENDED";
    allAdAccounts: boolean | null;
    allCreators: boolean | null;
    maxLookbackDays: number | null;
    earliestDataDate: string | null;
  };
  roles: {
    key: string;
    allAdAccounts: boolean;
    allCreators: boolean;
    maxLookbackDays: number | null;
    permissions: string[];
    metrics: string[];
  }[];
  permissionOverrides: { permissionKey: string; granted: boolean }[];
  metricOverrides: { metricKey: string; granted: boolean }[];
  adAccountIds: string[];
  creatorIds: string[];
}

export function resolveAccess(input: AccessInput): AccessContext {
  const { user } = input;
  if (user.status !== "ACTIVE") throw new ForbiddenError("This account is not active");

  const roleKeys = input.roles.map((r) => r.key);
  const isSuperAdmin = roleKeys.includes(SUPER_ADMIN_ROLE);

  if (isSuperAdmin) {
    return {
      userId: user.id, email: user.email, name: user.name, isSuperAdmin, roleKeys,
      permissions: new Set(PERMISSION_KEYS), metrics: new Set(METRIC_KEYS),
      adAccounts: "ALL", creators: "ALL", maxLookbackDays: null, earliestDataDate: null,
    };
  }

  // Permissions: union of roles, then explicit per-user grants/denials (deny wins).
  const permissions = new Set<PermissionKey>();
  for (const r of input.roles) for (const p of r.permissions) if (isPermissionKey(p)) permissions.add(p);
  for (const o of input.permissionOverrides) {
    if (!isPermissionKey(o.permissionKey)) continue;
    if (o.granted) permissions.add(o.permissionKey);
    else permissions.delete(o.permissionKey);
  }

  // Metrics: union of role metrics, then per-user overrides (deny wins). Unknown keys are ignored.
  const known = new Set(METRIC_KEYS);
  const metrics = new Set<string>();
  for (const r of input.roles) for (const m of r.metrics) if (known.has(m)) metrics.add(m);
  for (const o of input.metricOverrides) {
    if (!known.has(o.metricKey)) continue;
    if (o.granted) metrics.add(o.metricKey);
    else metrics.delete(o.metricKey);
  }

  const roleAllAccounts = input.roles.some((r) => r.allAdAccounts);
  const roleAllCreators = input.roles.some((r) => r.allCreators);
  const allAccounts = user.allAdAccounts ?? roleAllAccounts;
  const allCreators = user.allCreators ?? roleAllCreators;

  let maxLookbackDays: number | null;
  if (user.maxLookbackDays !== null) maxLookbackDays = user.maxLookbackDays;
  else if (input.roles.length === 0) maxLookbackDays = 0;
  else if (input.roles.some((r) => r.maxLookbackDays === null)) maxLookbackDays = null;
  else maxLookbackDays = Math.max(...input.roles.map((r) => r.maxLookbackDays as number));

  return {
    userId: user.id, email: user.email, name: user.name, isSuperAdmin, roleKeys,
    permissions, metrics,
    adAccounts: allAccounts ? "ALL" : [...new Set(input.adAccountIds)],
    creators: allCreators ? "ALL" : [...new Set(input.creatorIds)],
    maxLookbackDays,
    earliestDataDate: user.earliestDataDate,
  };
}

export function can(ctx: AccessContext, p: PermissionKey): boolean {
  return ctx.permissions.has(p);
}

export function canAny(ctx: AccessContext, ps: PermissionKey[]): boolean {
  return ps.some((p) => ctx.permissions.has(p));
}

export function requirePermission(ctx: AccessContext, p: PermissionKey | PermissionKey[]): void {
  const list = Array.isArray(p) ? p : [p];
  if (!canAny(ctx, list)) throw new ForbiddenError();
}

export function inScope(scope: Scope, id: string | null | undefined): boolean {
  if (scope === "ALL") return true;
  return id != null && scope.includes(id);
}

export function assertCreatorAccess(ctx: AccessContext, creatorId: string): void {
  // Same message as not-found so restricted creator ids cannot be enumerated.
  if (!inScope(ctx.creators, creatorId)) throw new ForbiddenError("Creator not found or not accessible");
}

export function assertAdAccountAccess(ctx: AccessContext, adAccountId: string): void {
  if (!inScope(ctx.adAccounts, adAccountId)) throw new ForbiddenError("Ad account not found or not accessible");
}

/** Narrow a requested id filter to the user's scope. Ids outside scope are dropped, never trusted. */
export function intersectScope(scope: Scope, requested: string[] | undefined): Scope {
  if (!requested || requested.length === 0) return scope;
  if (scope === "ALL") return requested;
  const allowed = new Set(scope);
  return requested.filter((id) => allowed.has(id));
}
