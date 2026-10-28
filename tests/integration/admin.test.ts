import { beforeAll, describe, expect, it } from "vitest";
import { ctxFor, makeFixture, makeUser, RANGE, resetDb } from "../helpers/db";
import { prisma } from "@/lib/db";
import { assignAds, applyNamingRules } from "@/lib/mapping/service";
import { acceptInvitation, findValidInvitation, inviteUser, suspendUser, updateUserAccess } from "@/lib/users/service";
import { buildExport } from "@/lib/reporting/export";
import { getOverview } from "@/lib/reporting/service";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { sha256Hex } from "@/lib/crypto";

let f: Awaited<ReturnType<typeof makeFixture>>;
let admin: string, mm: string, content: string;
const actor = (id: string) => ({ userId: id, email: `${id}@t` });

beforeAll(async () => {
  await resetDb();
  f = await makeFixture();
  admin = await makeUser({ email: "admin@t", role: "super_admin" });
  mm = await makeUser({ email: "mm@t", role: "marketing_manager", accounts: [f.acc2.id] });
  content = await makeUser({ email: "content@t", role: "content_manager", creators: [f.creatorA.id], metricOverrides: [{ key: "spend", granted: false }] });
});

describe("creator mapping", () => {
  it("maps an unmapped ad, records history and audit, and keeps one creator per ad", async () => {
    const ctx = await ctxFor(admin);
    expect((await assignAds(ctx, actor(admin), { adIds: [f.adU.id], creatorId: f.creatorB.id, method: "MANUAL", reason: "brief" })).changed).toBe(1);
    await assignAds(ctx, actor(admin), { adIds: [f.adU.id], creatorId: f.creatorA.id, method: "MANUAL" }); // reassign
    expect(await prisma.adCreatorMapping.count({ where: { adId: f.adU.id } })).toBe(1);
    const history = await prisma.mappingChange.findMany({ where: { adId: f.adU.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => [h.previousCreatorId, h.newCreatorId])).toEqual([[null, f.creatorB.id], [f.creatorB.id, f.creatorA.id]]);
    expect(await prisma.auditLog.count({ where: { action: "mapping.assign" } })).toBe(2);
    // Creator totals still sum to mapped total → no double counting after reassignment.
    const o = await getOverview(ctx, RANGE);
    const sum = o.creatorRanking.rows.reduce((s, r) => s + (r.metrics.spend.s === "ok" ? r.metrics.spend.v : 0), 0);
    expect(sum).toBe(21600);
    await assignAds(ctx, actor(admin), { adIds: [f.adU.id], creatorId: null, method: "MANUAL" }); // unmap
    expect(await prisma.adCreatorMapping.count({ where: { adId: f.adU.id } })).toBe(0);
  });

  it("enforces ad-account scope and asset ownership", async () => {
    await expect(assignAds(await ctxFor(mm), actor(mm), { adIds: [f.adU.id], creatorId: f.creatorA.id, method: "MANUAL" })).rejects.toBeInstanceOf(ForbiddenError);
    const assetB = await prisma.creativeAsset.create({ data: { creatorId: f.creatorB.id, title: "B asset" } });
    await expect(assignAds(await ctxFor(admin), actor(admin), { adIds: [f.adU.id], creatorId: f.creatorA.id, creativeAssetId: assetB.id, method: "MANUAL" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("naming rules map only unmapped ads, never override manual mappings, and skip ambiguity", async () => {
    await prisma.namingRule.create({ data: { name: "code", source: "AD_NAME", matchField: "CREATOR_CODE", prefix: "", priority: 1 } });
    await prisma.ad.update({ where: { id: f.adU.id }, data: { name: "S25_CRB_hook" } });
    await prisma.ad.update({ where: { id: f.adA1.id }, data: { name: "S25_CRB_but_manually_A" } });
    const dry = await applyNamingRules({ actor: actor(admin), dryRun: true });
    expect(dry.matched).toBe(1);
    expect(await prisma.adCreatorMapping.count({ where: { adId: f.adU.id } })).toBe(0);
    await applyNamingRules({ actor: actor(admin) });
    expect((await prisma.adCreatorMapping.findUniqueOrThrow({ where: { adId: f.adU.id } })).method).toBe("NAMING_RULE");
    expect((await prisma.adCreatorMapping.findUniqueOrThrow({ where: { adId: f.adA1.id } })).creatorId).toBe(f.creatorA.id);
    await prisma.adCreatorMapping.delete({ where: { adId: f.adU.id } });
    await prisma.ad.update({ where: { id: f.adU.id }, data: { name: "CRA vs CRB" } });
    expect((await applyNamingRules({ actor: actor(admin), dryRun: true })).ambiguous).toBe(1);
  });
});

describe("users, invitations and privilege escalation", () => {
  const contentRole = () => prisma.role.findUniqueOrThrow({ where: { key: "content_manager" } });
  const superRole = () => prisma.role.findUniqueOrThrow({ where: { key: "super_admin" } });

  it("invites a user with selected creators and metrics; the token is single-use and stored hashed", async () => {
    const r = await inviteUser(await ctxFor(admin), actor(admin), {
      email: "New.Person@Example.com", name: "New Person", roleIds: [(await contentRole()).id], creatorIds: [f.creatorB.id],
      metricOverrides: [{ key: "purchase_value", granted: false }],
    });
    expect(r.delivered).toBe(false); // SMTP not configured in tests → link returned to admin
    const token = r.inviteUrl!.split("/invite/")[1];
    const inv = await prisma.invitation.findFirstOrThrow({ where: { userId: r.userId } });
    expect(inv.tokenHash).toBe(sha256Hex(token));
    expect(inv.tokenHash).not.toContain(token);
    await expect(acceptInvitation({ token, name: "New Person", password: "short" }, {})).rejects.toThrow();
    await acceptInvitation({ token, name: "New Person", password: "a-long-enough-passphrase" }, {});
    expect(await findValidInvitation(token)).toBeNull();
    await expect(acceptInvitation({ token, name: "x", password: "a-long-enough-passphrase" }, {})).rejects.toBeInstanceOf(ValidationError);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: r.userId } });
    expect(u).toMatchObject({ status: "ACTIVE", email: "new.person@example.com" });
    const ctx = await ctxFor(r.userId);
    expect(ctx.creators).toEqual([f.creatorB.id]);
    expect(ctx.metrics.has("purchase_value")).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: { in: ["user.invited", "user.invitation_accepted"] } } })).toBe(2);
  });

  it("expired invitations are rejected", async () => {
    const r = await inviteUser(await ctxFor(admin), actor(admin), { email: "late@example.com", name: "Late", roleIds: [(await contentRole()).id] });
    await prisma.invitation.updateMany({ where: { userId: r.userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(acceptInvitation({ token: r.inviteUrl!.split("/invite/")[1], name: "Late", password: "a-long-enough-passphrase" }, {})).rejects.toBeInstanceOf(ValidationError);
  });

  it("non-super-admins cannot grant access they do not hold", async () => {
    const usersAdmin = await makeUser({ email: "ua@t", role: "content_manager", creators: [f.creatorA.id], permissionOverrides: [{ key: "users.manage", granted: true }] });
    const ctx = await ctxFor(usersAdmin);
    const base = { email: "x1@example.com", name: "X", roleIds: [(await contentRole()).id] };
    await expect(inviteUser(ctx, actor(usersAdmin), { ...base, roleIds: [(await superRole()).id] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(inviteUser(ctx, actor(usersAdmin), { ...base, creatorIds: [f.creatorB.id] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(inviteUser(ctx, actor(usersAdmin), { ...base, metricOverrides: [{ key: "spend", granted: true }] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(inviteUser(ctx, actor(usersAdmin), { ...base, allCreators: true })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateUserAccess(ctx, actor(usersAdmin), admin, { roleIds: [(await contentRole()).id] })).rejects.toBeInstanceOf(ForbiddenError);
    // Within their own scope it works.
    await expect(inviteUser(ctx, actor(usersAdmin), { ...base, creatorIds: [f.creatorA.id] })).resolves.toBeDefined();
  });

  it("access changes apply immediately and are audited with before/after", async () => {
    await updateUserAccess(await ctxFor(admin), actor(admin), content, { roleIds: [(await contentRole()).id], creatorIds: [f.creatorB.id] });
    expect((await ctxFor(content)).creators).toEqual([f.creatorB.id]);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.access_updated", targetId: content } });
    expect(log.metadata).toMatchObject({ before: { creatorIds: [f.creatorA.id] }, after: { creatorIds: [f.creatorB.id] } });
  });

  it("suspension revokes sessions immediately and protects the last super admin", async () => {
    await prisma.session.create({ data: { id: "s1", token: "tok1", userId: content, expiresAt: new Date(Date.now() + 3_600_000) } });
    await suspendUser(await ctxFor(admin), actor(admin), content, "left the team");
    expect(await prisma.session.count({ where: { userId: content } })).toBe(0);
    await expect(ctxFor(content)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(suspendUser(await ctxFor(admin), actor(admin), admin)).rejects.toBeInstanceOf(ValidationError);
    await expect(updateUserAccess(await ctxFor(admin), actor(admin), admin, { roleIds: [(await contentRole()).id] })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("exports", () => {
  it("contains only permitted creators and metrics, respects filters, and is audited", async () => {
    const viewer = await makeUser({ email: "exp@t", role: "content_manager", creators: [f.creatorA.id], metricOverrides: [{ key: "spend", granted: false }] });
    const out = await buildExport(await ctxFor(viewer), actor(viewer), "creatives", { ...RANGE, creator: f.creatorB.id });
    // Asked for creator B (not permitted) → only the header row.
    expect(out.body.trim().split("\r\n")).toHaveLength(1);
    const own = await buildExport(await ctxFor(viewer), actor(viewer), "creatives", RANGE);
    const [header, ...rows] = own.body.replace("﻿", "").trim().split("\r\n");
    expect(header).not.toMatch(/Amount spent|CPM|Cost per/);
    expect(header).toMatch(/Purchases/);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.includes("Creator A"))).toBe(true);
    const audit = await prisma.auditLog.findMany({ where: { action: "export.csv", actorId: viewer } });
    expect(audit).toHaveLength(2);
    expect((audit[1].metadata as { metrics: string[] }).metrics).not.toContain("spend");
  });

  it("is refused without export permission", async () => {
    const noExport = await makeUser({ email: "noexp@t", role: "content_manager", creators: [f.creatorA.id], permissionOverrides: [{ key: "reports.export", granted: false }] });
    await expect(buildExport(await ctxFor(noExport), actor(noExport), "creators", RANGE)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
