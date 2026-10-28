import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { METRIC_KEYS } from "@/lib/metrics/catalog";
import { parseDateRange, type DateRange } from "./date-range";

export const CREATIVE_TYPES = ["VIDEO", "IMAGE", "CAROUSEL", "OTHER", "UNKNOWN"] as const;
export type CreativeTypeFilter = (typeof CREATIVE_TYPES)[number];

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Invalid id");
const ids = z.array(id).max(200).default([]);

const querySchema = z.object({
  range: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  account: ids,
  campaign: ids,
  creator: ids,
  product: z.array(z.string().min(1).max(120)).max(50).default([]),
  type: z.array(z.enum(CREATIVE_TYPES)).max(5).default([]),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(METRIC_KEYS as [string, ...string[]]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  compare: z.enum(["1", "0", "true", "false"]).optional(),
  minSpend: z.coerce.number().min(0).max(1e12).optional(),
  minPurchases: z.coerce.number().min(0).max(1e9).optional(),
});

export interface ReportFilters {
  range: DateRange;
  adAccountIds: string[];
  campaignIds: string[];
  creatorIds: string[];
  products: string[];
  creativeTypes: CreativeTypeFilter[];
  search?: string;
}

export interface ReportQuery {
  filters: ReportFilters;
  sort?: string;
  dir?: "asc" | "desc";
  page: number;
  pageSize: number;
  compare: boolean;
  minSpend?: number;
  minPurchases?: number;
}

const MULTI = ["account", "campaign", "creator", "product", "type"];

export function searchParamsToObject(sp: URLSearchParams | Record<string, string | string[] | undefined>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const entries: [string, string][] =
    sp instanceof URLSearchParams
      ? [...sp.entries()]
      : Object.entries(sp).flatMap(([k, v]) => (v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]]));
  for (const [k, v] of entries) {
    if (MULTI.includes(k)) {
      // Accept both repeated params and comma-separated lists.
      const parts = v.split(",").filter(Boolean);
      out[k] = [...((out[k] as string[]) ?? []), ...parts];
    } else if (v !== "") out[k] = v;
  }
  return out;
}

export function parseReportQuery(
  sp: URLSearchParams | Record<string, string | string[] | undefined>,
  timeZone: string,
  now: Date = new Date(),
): ReportQuery {
  const parsed = querySchema.safeParse(searchParamsToObject(sp));
  if (!parsed.success) throw new ValidationError("Invalid report filters", parsed.error.issues.map((i) => i.message));
  const q = parsed.data;
  return {
    filters: {
      range: parseDateRange({ range: q.range, from: q.from, to: q.to }, timeZone, now),
      adAccountIds: q.account,
      campaignIds: q.campaign,
      creatorIds: q.creator,
      products: q.product,
      creativeTypes: q.type,
      search: q.q || undefined,
    },
    sort: q.sort,
    dir: q.dir,
    page: q.page,
    pageSize: q.pageSize,
    compare: q.compare === "1" || q.compare === "true",
    minSpend: q.minSpend,
    minPurchases: q.minPurchases,
  };
}
