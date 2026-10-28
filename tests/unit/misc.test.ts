import { describe, expect, it } from "vitest";
import { containsToken, matchCreator } from "@/lib/mapping/naming";
import { csvCell } from "@/lib/reporting/export";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { chunkRange } from "@/lib/sync/scheduler";
import { dedupeKey } from "@/lib/sync/queue";

const creators = [
  { id: "a", code: "CR01", instagramHandle: "riya" },
  { id: "b", code: "CR011", instagramHandle: "dev" },
];
const rule = (o = {}) => ({ id: "r", source: "AD_NAME" as const, matchField: "CREATOR_CODE" as const, prefix: "", priority: 1, enabled: true, ...o });

describe("naming rules", () => {
  it("matches whole tokens only", () => {
    expect(containsToken("S25_CR01_HookA", "CR01")).toBe(true);
    expect(containsToken("S25_CR011_HookA", "CR01")).toBe(false);
    expect(containsToken("cr01 summer", "CR01")).toBe(true);
  });
  it("maps a unique match and refuses ambiguous names", () => {
    expect(matchCreator({ adName: "S25_CR011_x", adSetName: "", campaignName: "" }, [rule()], creators)).toMatchObject({ kind: "match", creatorId: "b" });
    expect(matchCreator({ adName: "CR01 vs CR011", adSetName: "", campaignName: "" }, [rule()], creators).kind).toBe("ambiguous");
    expect(matchCreator({ adName: "nothing", adSetName: "", campaignName: "" }, [rule()], creators).kind).toBe("none");
  });
  it("supports prefixes, handles and other name sources; disabled rules are ignored", () => {
    expect(matchCreator({ adName: "x", adSetName: "", campaignName: "Promo @riya" }, [rule({ source: "CAMPAIGN_NAME", matchField: "INSTAGRAM_HANDLE", prefix: "@" })], creators)).toMatchObject({ creatorId: "a" });
    expect(matchCreator({ adName: "S25_CR01", adSetName: "", campaignName: "" }, [rule({ enabled: false })], creators).kind).toBe("none");
  });
});

describe("CSV export safety", () => {
  it("neutralises formula injection and quotes", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell(null)).toBe("");
  });
});

describe("token encryption", () => {
  it("round-trips and uses a fresh IV", () => {
    const a = encryptSecret("EAAB-secret");
    expect(a).not.toContain("EAAB");
    expect(decryptSecret(a)).toBe("EAAB-secret");
    expect(encryptSecret("EAAB-secret")).not.toBe(a);
  });
  it("detects tampering", () => {
    const parts = encryptSecret("EAAB-secret").split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });
});

describe("sync planning", () => {
  it("chunks history newest-first without gaps or overlap", () => {
    const c = chunkRange("2026-01-01", "2026-03-01", 30);
    expect(c[0][1]).toBe("2026-03-01");
    expect(c.at(-1)![0]).toBe("2026-01-01");
    for (let i = 1; i < c.length; i++) expect(new Date(c[i][1]).getTime() + 86_400_000).toBe(new Date(c[i - 1][0]).getTime());
  });
  it("dedupe keys identify the unit of work", () => {
    expect(dedupeKey({ adAccountId: "a", type: "INSIGHTS", dateFrom: "2026-01-01", dateTo: "2026-01-30" })).toBe("INSIGHTS:a:-:2026-01-01:2026-01-30");
  });
});
