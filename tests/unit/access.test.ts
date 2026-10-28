import { describe, expect, it } from "vitest";
import { intersectScope, resolveAccess, requirePermission, assertCreatorAccess, type AccessInput } from "@/lib/access/context";
import { ForbiddenError } from "@/lib/errors";

const base = (over: Partial<AccessInput> = {}): AccessInput => ({
  user: { id: "u", email: "u@x", name: "U", status: "ACTIVE", allAdAccounts: null, allCreators: null, maxLookbackDays: null, earliestDataDate: null },
  roles: [{ key: "content_manager", allAdAccounts: true, allCreators: false, maxLookbackDays: 365, permissions: ["reports.creators", "reports.export"], metrics: ["purchases", "roas", "spend"] }],
  permissionOverrides: [],
  metricOverrides: [],
  adAccountIds: [],
  creatorIds: ["c1"],
  ...over,
});

describe("access resolution", () => {
  it("unions role permissions and metrics and applies scopes", () => {
    const ctx = resolveAccess(base());
    expect(ctx.permissions.has("reports.creators")).toBe(true);
    expect(ctx.creators).toEqual(["c1"]);
    expect(ctx.adAccounts).toBe("ALL");
    expect(ctx.maxLookbackDays).toBe(365);
  });
  it("per-user denials beat role grants (hide spend, disable export)", () => {
    const ctx = resolveAccess(base({ metricOverrides: [{ metricKey: "spend", granted: false }], permissionOverrides: [{ permissionKey: "reports.export", granted: false }] }));
    expect(ctx.metrics.has("spend")).toBe(false);
    expect(ctx.metrics.has("roas")).toBe(true);
    expect(ctx.permissions.has("reports.export")).toBe(false);
  });
  it("ignores unknown permission and metric keys", () => {
    const ctx = resolveAccess(base({ metricOverrides: [{ metricKey: "secret_metric", granted: true }], permissionOverrides: [{ permissionKey: "root", granted: true }] }));
    expect(ctx.metrics.has("secret_metric")).toBe(false);
    expect([...ctx.permissions]).not.toContain("root");
  });
  it("super admin gets everything", () => {
    const ctx = resolveAccess(base({ roles: [{ key: "super_admin", allAdAccounts: true, allCreators: true, maxLookbackDays: null, permissions: [], metrics: [] }] }));
    expect(ctx.isSuperAdmin).toBe(true);
    expect(ctx.creators).toBe("ALL");
    expect(ctx.metrics.has("spend")).toBe(true);
  });
  it("suspended and invited users have no access", () => {
    expect(() => resolveAccess(base({ user: { ...base().user, status: "SUSPENDED" } }))).toThrow(ForbiddenError);
    expect(() => resolveAccess(base({ user: { ...base().user, status: "INVITED" } }))).toThrow(ForbiddenError);
  });
  it("a user with no roles sees nothing", () => {
    const ctx = resolveAccess(base({ roles: [], creatorIds: [] }));
    expect(ctx.permissions.size).toBe(0);
    expect(ctx.creators).toEqual([]);
    expect(ctx.maxLookbackDays).toBe(0);
  });
  it("request filters can only narrow scope, never widen it", () => {
    expect(intersectScope(["a", "b"], ["b", "z"])).toEqual(["b"]);
    expect(intersectScope(["a"], ["z"])).toEqual([]);
    expect(intersectScope("ALL", ["z"])).toEqual(["z"]);
    expect(intersectScope(["a"], undefined)).toEqual(["a"]);
  });
  it("guards throw ForbiddenError", () => {
    const ctx = resolveAccess(base());
    expect(() => requirePermission(ctx, "users.manage")).toThrow(ForbiddenError);
    expect(() => assertCreatorAccess(ctx, "c2")).toThrow(ForbiddenError);
    expect(() => assertCreatorAccess(ctx, "c1")).not.toThrow();
  });
});
