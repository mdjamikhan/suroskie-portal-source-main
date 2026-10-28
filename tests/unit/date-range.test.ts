import { describe, expect, it } from "vitest";
import { clampRange, parseDateRange, presetRange, previousPeriod, todayIn } from "@/lib/reporting/date-range";
import { ValidationError } from "@/lib/errors";

// 2026-10-27 20:00 UTC is already 2026-10-28 01:30 in Asia/Kolkata.
const late = new Date("2026-10-27T20:00:00Z");

describe("date ranges", () => {
  it("computes 'today' in the reporting time zone", () => {
    expect(todayIn("Asia/Kolkata", late)).toBe("2026-10-28");
    expect(todayIn("UTC", late)).toBe("2026-10-27");
  });
  it("presets exclude today for last N days", () => {
    expect(presetRange("yesterday", "Asia/Kolkata", late)).toMatchObject({ from: "2026-10-27", to: "2026-10-27" });
    expect(presetRange("last_7d", "Asia/Kolkata", late)).toMatchObject({ from: "2026-10-21", to: "2026-10-27" });
    expect(presetRange("last_30d", "Asia/Kolkata", late)).toMatchObject({ from: "2026-09-28", to: "2026-10-27" });
    expect(presetRange("last_90d", "Asia/Kolkata", late).from).toBe("2026-07-30");
  });
  it("validates custom ranges", () => {
    expect(parseDateRange({ range: "custom", from: "2026-10-01", to: "2026-10-03" }, "Asia/Kolkata")).toMatchObject({ from: "2026-10-01", to: "2026-10-03" });
    expect(() => parseDateRange({ range: "custom", from: "2026-10-05", to: "2026-10-01" }, "UTC")).toThrow(ValidationError);
    expect(() => parseDateRange({ range: "custom", from: "2026-02-30", to: "2026-03-01" }, "UTC")).toThrow(ValidationError);
    expect(() => parseDateRange({ range: "custom", from: "2020-01-01", to: "2026-01-01" }, "UTC")).toThrow(/limited/);
    expect(() => parseDateRange({ range: "forever" }, "UTC")).toThrow(ValidationError);
  });
  it("clamps to the user's authorised window", () => {
    const r = { preset: "custom" as const, from: "2026-01-01", to: "2026-10-20" };
    const c = clampRange(r, { maxLookbackDays: 90, earliestDataDate: null }, "Asia/Kolkata", late);
    expect(c).toMatchObject({ clamped: true, empty: false, range: { from: "2026-07-30", to: "2026-10-20" } });
    const e = clampRange({ preset: "custom", from: "2025-01-01", to: "2025-02-01" }, { maxLookbackDays: 90, earliestDataDate: null }, "Asia/Kolkata", late);
    expect(e.empty).toBe(true);
    const f = clampRange(r, { maxLookbackDays: null, earliestDataDate: "2026-09-01" }, "Asia/Kolkata", late);
    expect(f.range.from).toBe("2026-09-01");
    expect(clampRange(r, { maxLookbackDays: null, earliestDataDate: null }, "UTC").clamped).toBe(false);
  });
  it("previous period has equal length and ends the day before", () => {
    expect(previousPeriod({ preset: "custom", from: "2026-10-08", to: "2026-10-14" })).toMatchObject({ from: "2026-10-01", to: "2026-10-07" });
  });
});
