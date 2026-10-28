// Creator ↔ ad mapping with full change history and audit logging.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { audit, type AuditActor } from "@/lib/audit";
import { inScope, type AccessContext } from "@/lib/access/context";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { matchCreator } from "./naming";

export interface AssignInput {
  adIds: string[];
  /** null = unassign */
  creatorId: string | null;
  creativeAssetId?: string | null;
  method: "MANUAL" | "BULK" | "NAMING_RULE";
  reason?: string;
  notes?: string;
}

/**
 * Assign (or unassign) ads to a creator. Each ad has at most one creator (unique adId), which
 * is what prevents double counting in creator rankings. Every change writes a MappingChange row.
 */
export async function assignAds(ctx: AccessContext, actor: AuditActor, input: AssignInput) {
  const adIds = [...new Set(input.adIds)];
  if (!adIds.length) throw new ValidationError("Select at least one ad");
  if (adIds.length > 1000) throw new ValidationError("Bulk mapping is limited to 1,000 ads at a time");

  const ads = await prisma.ad.findMany({ where: { id: { in: adIds } }, select: { id: true, adAccountId: true, name: true, mapping: true } });
  if (ads.length !== adIds.length) throw new ValidationError("One or more ads were not found");
  for (const ad of ads) if (!inScope(ctx.adAccounts, ad.adAccountId)) throw new ForbiddenError("One or more ads are outside your ad account access");

  if (input.creatorId) {
    if (!inScope(ctx.creators, input.creatorId)) throw new ForbiddenError("Creator not found or not accessible");
    const creator = await prisma.creator.findUnique({ where: { id: input.creatorId }, select: { id: true, isActive: true } });
    if (!creator) throw new ValidationError("Creator not found");
  }
  if (input.creativeAssetId) {
    const asset = await prisma.creativeAsset.findUnique({ where: { id: input.creativeAssetId }, select: { creatorId: true } });
    if (!asset || asset.creatorId !== input.creatorId) throw new ValidationError("The creative asset must belong to the selected creator");
  }

  let changed = 0;
  await prisma.$transaction(async (tx) => {
    for (const ad of ads) {
      const prev = ad.mapping;
      const newAsset = input.creatorId ? (input.creativeAssetId ?? (prev?.creatorId === input.creatorId ? prev.creativeAssetId : null)) : null;
      if (prev?.creatorId === input.creatorId && (prev?.creativeAssetId ?? null) === newAsset) continue;
      if (input.creatorId === null) {
        if (!prev) continue;
        await tx.adCreatorMapping.delete({ where: { adId: ad.id } });
      } else {
        await tx.adCreatorMapping.upsert({
          where: { adId: ad.id },
          create: { adId: ad.id, creatorId: input.creatorId, creativeAssetId: newAsset, method: input.method, mappedById: actor.userId, notes: input.notes },
          update: { creatorId: input.creatorId, creativeAssetId: newAsset, method: input.method, mappedById: actor.userId, namingRuleId: null, ...(input.notes !== undefined ? { notes: input.notes } : {}) },
        });
      }
      await tx.mappingChange.create({
        data: {
          adId: ad.id, previousCreatorId: prev?.creatorId ?? null, newCreatorId: input.creatorId,
          previousAssetId: prev?.creativeAssetId ?? null, newAssetId: newAsset, method: input.method, changedById: actor.userId, reason: input.reason,
        },
      });
      changed++;
    }
    if (changed) {
      await audit(actor, input.creatorId ? "mapping.assign" : "mapping.unassign",
        input.creatorId ? `Mapped ${changed} ad(s) to creator` : `Unmapped ${changed} ad(s)`,
        { targetType: "creator", targetId: input.creatorId ?? undefined, metadata: { adIds: adIds.slice(0, 200), count: changed, method: input.method, creativeAssetId: input.creativeAssetId ?? null, reason: input.reason ?? null } },
        tx);
    }
  });
  return { changed };
}

/**
 * Apply enabled naming rules to unmapped ads (optionally limited to one account).
 * Never touches ads that already have a mapping.
 */
export async function applyNamingRules(opts: { adAccountId?: string; actor: AuditActor; dryRun?: boolean }) {
  const [rules, creators] = await Promise.all([
    prisma.namingRule.findMany({ where: { enabled: true } }),
    prisma.creator.findMany({ where: { isActive: true }, select: { id: true, code: true, instagramHandle: true } }),
  ]);
  if (!rules.length || !creators.length) return { matched: 0, ambiguous: 0, scanned: 0, preview: [] as { adId: string; adName: string; creatorId: string }[] };

  const ads = await prisma.ad.findMany({
    where: { mapping: null, ...(opts.adAccountId ? { adAccountId: opts.adAccountId } : {}) },
    select: { id: true, name: true, adSet: { select: { name: true } }, campaign: { select: { name: true } } },
    take: 20_000,
  });

  const matches: { adId: string; adName: string; creatorId: string; ruleId: string }[] = [];
  let ambiguous = 0;
  for (const ad of ads) {
    const m = matchCreator({ adName: ad.name, adSetName: ad.adSet.name, campaignName: ad.campaign.name }, rules, creators);
    if (m.kind === "match") matches.push({ adId: ad.id, adName: ad.name, creatorId: m.creatorId, ruleId: m.ruleId });
    else if (m.kind === "ambiguous") ambiguous++;
  }
  if (opts.dryRun || !matches.length) return { matched: matches.length, ambiguous, scanned: ads.length, preview: matches.slice(0, 50) };

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const m of matches) {
      // createMany-with-skip semantics: a concurrent manual mapping wins.
      const created = await tx.adCreatorMapping.createMany({
        data: [{ adId: m.adId, creatorId: m.creatorId, method: "NAMING_RULE", namingRuleId: m.ruleId, mappedById: opts.actor.userId }],
        skipDuplicates: true,
      });
      if (created.count) {
        await tx.mappingChange.create({ data: { adId: m.adId, previousCreatorId: null, newCreatorId: m.creatorId, method: "NAMING_RULE", changedById: opts.actor.userId, reason: `Naming rule ${m.ruleId}` } });
      }
    }
    await audit(opts.actor, "mapping.naming_rules_applied", `Naming rules mapped ${matches.length} ad(s)`, { metadata: { matched: matches.length, ambiguous, adAccountId: opts.adAccountId ?? null } }, tx);
  });
  return { matched: matches.length, ambiguous, scanned: ads.length, preview: matches.slice(0, 50) };
}
