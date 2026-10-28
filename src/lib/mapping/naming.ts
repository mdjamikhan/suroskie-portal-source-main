// Naming-convention auto-mapping. Matching is literal and token-bounded (no user regex, so no
// ReDoS risk). A rule only ever maps *unmapped* ads and never overrides a manual mapping.
// Ambiguous names (more than one creator matches) are left unmapped for human review.

export interface NamingRuleLike {
  id: string;
  source: "AD_NAME" | "ADSET_NAME" | "CAMPAIGN_NAME";
  matchField: "CREATOR_CODE" | "INSTAGRAM_HANDLE";
  prefix: string;
  priority: number;
  enabled: boolean;
}

export interface CreatorKey {
  id: string;
  code: string;
  instagramHandle: string | null;
}

export interface AdNames {
  adName: string;
  adSetName: string;
  campaignName: string;
}

const isWordChar = (c: string | undefined) => c !== undefined && /[a-z0-9]/i.test(c);

/** True when `needle` occurs in `hay` delimited by non-alphanumeric characters (case-insensitive). */
export function containsToken(hay: string, needle: string): boolean {
  if (!needle) return false;
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  let from = 0;
  for (;;) {
    const i = h.indexOf(n, from);
    if (i === -1) return false;
    const before = i === 0 ? undefined : h[i - 1];
    const after = h[i + n.length];
    // Allow a non-alphanumeric first/last needle char (e.g. "@") to be its own boundary.
    const okBefore = !isWordChar(n[0]) || !isWordChar(before);
    const okAfter = !isWordChar(n[n.length - 1]) || !isWordChar(after);
    if (okBefore && okAfter) return true;
    from = i + 1;
  }
}

export type MatchResult = { kind: "match"; creatorId: string; ruleId: string } | { kind: "ambiguous"; ruleId: string; creatorIds: string[] } | { kind: "none" };

export function matchCreator(names: AdNames, rules: NamingRuleLike[], creators: CreatorKey[]): MatchResult {
  const ordered = rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    const hay = rule.source === "AD_NAME" ? names.adName : rule.source === "ADSET_NAME" ? names.adSetName : names.campaignName;
    const hits = new Set<string>();
    for (const c of creators) {
      const value = rule.matchField === "CREATOR_CODE" ? c.code : c.instagramHandle?.replace(/^@/, "");
      if (!value) continue;
      if (containsToken(hay, `${rule.prefix}${value}`)) hits.add(c.id);
    }
    if (hits.size === 1) return { kind: "match", creatorId: [...hits][0], ruleId: rule.id };
    if (hits.size > 1) return { kind: "ambiguous", ruleId: rule.id, creatorIds: [...hits] };
  }
  return { kind: "none" };
}
