// Minimal typed client for the official Meta Graph / Marketing API.
//  * Access token is sent in the Authorization header (never in URLs or logs).
//  * Every call carries appsecret_proof when the app secret is configured.
//  * Retries transient errors with exponential backoff + jitter; short rate-limit waits are
//    absorbed, long ones surface as MetaApiError(kind=rate_limit, retryAfterMs) so the job
//    queue can reschedule instead of blocking a worker.
//  * Reads Meta's usage headers and slows down proactively near the limit.
import { appSecretProof } from "@/lib/crypto";
import { MetaApiError, type MetaErrorBody } from "./errors";

export interface UsageSnapshot {
  appUsagePct?: number;
  adAccountUsagePct?: number;
  businessUseCaseUsagePct?: number;
  /** Seconds until access is regained, from x-business-use-case-usage. */
  regainAccessSeconds?: number;
  accessTier?: string;
}

export interface MetaClientOptions {
  accessToken: string;
  appSecret?: string;
  version: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  /** Longest rate-limit wait to absorb inline before giving up to the job queue. */
  maxInlineWaitMs?: number;
  timeoutMs?: number;
  onUsage?: (u: UsageSnapshot) => void;
  random?: () => number;
}

export type Params = Record<string, string | number | boolean | object | undefined>;

export interface Paged<T> {
  data: T[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function maxPct(obj: unknown): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const vals = Object.values(obj as Record<string, unknown>).filter((v): v is number => typeof v === "number");
  return vals.length ? Math.max(...vals) : undefined;
}

export function parseUsageHeaders(h: Headers): UsageSnapshot {
  const u: UsageSnapshot = {};
  try {
    const app = h.get("x-app-usage");
    if (app) u.appUsagePct = maxPct(JSON.parse(app));
  } catch {}
  try {
    const acc = h.get("x-ad-account-usage");
    if (acc) {
      const j = JSON.parse(acc);
      u.adAccountUsagePct = typeof j.acc_id_util_pct === "number" ? j.acc_id_util_pct : undefined;
      if (typeof j.reset_time_duration === "number" && j.reset_time_duration > 0) u.regainAccessSeconds = j.reset_time_duration;
      if (typeof j.ads_api_access_tier === "string") u.accessTier = j.ads_api_access_tier;
    }
  } catch {}
  try {
    const buc = h.get("x-business-use-case-usage");
    if (buc) {
      const j = JSON.parse(buc) as Record<string, { call_count?: number; total_cputime?: number; total_time?: number; estimated_time_to_regain_access?: number }[]>;
      let pct = 0;
      let regainMin = 0;
      for (const entries of Object.values(j)) {
        for (const e of entries ?? []) {
          pct = Math.max(pct, e.call_count ?? 0, e.total_cputime ?? 0, e.total_time ?? 0);
          regainMin = Math.max(regainMin, e.estimated_time_to_regain_access ?? 0);
        }
      }
      u.businessUseCaseUsagePct = pct;
      if (regainMin > 0) u.regainAccessSeconds = Math.max(u.regainAccessSeconds ?? 0, regainMin * 60);
    }
  } catch {}
  return u;
}

export class MetaClient {
  private readonly o: Required<Omit<MetaClientOptions, "appSecret" | "onUsage">> & Pick<MetaClientOptions, "appSecret" | "onUsage">;
  private proof?: string;
  lastUsage: UsageSnapshot = {};
  requestCount = 0;

  constructor(opts: MetaClientOptions) {
    this.o = {
      fetchImpl: globalThis.fetch.bind(globalThis),
      sleep: defaultSleep,
      maxRetries: 5,
      maxInlineWaitMs: 60_000,
      timeoutMs: 90_000,
      random: Math.random,
      ...opts,
    };
    if (opts.appSecret) this.proof = appSecretProof(opts.accessToken, opts.appSecret);
  }

  private url(path: string, params: Params = {}): string {
    const u = new URL(`${this.o.baseUrl.replace(/\/$/, "")}/${this.o.version}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      u.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    if (this.proof) u.searchParams.set("appsecret_proof", this.proof);
    return u.toString();
  }

  private backoff(attempt: number): number {
    const base = Math.min(60_000, 2_000 * 2 ** attempt);
    return Math.round(base / 2 + this.o.random() * (base / 2));
  }

  async request<T>(method: "GET" | "POST", path: string, params: Params = {}): Promise<T> {
    let attempt = 0;
    for (;;) {
      // Proactive throttle when Meta reports we are close to a limit.
      const util = Math.max(this.lastUsage.appUsagePct ?? 0, this.lastUsage.adAccountUsagePct ?? 0, this.lastUsage.businessUseCaseUsagePct ?? 0);
      if (util >= 90) await this.o.sleep(Math.min(this.o.maxInlineWaitMs, 15_000));
      else if (util >= 75) await this.o.sleep(2_000);

      let res: Response;
      try {
        this.requestCount++;
        const isPost = method === "POST";
        const body = isPost
          ? new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : [[k, typeof v === "object" ? JSON.stringify(v) : String(v)]])))
          : undefined;
        if (isPost && this.proof) body!.set("appsecret_proof", this.proof);
        res = await this.o.fetchImpl(isPost ? this.url(path) : this.url(path, params), {
          method,
          headers: { Authorization: `Bearer ${this.o.accessToken}`, Accept: "application/json" },
          body,
          signal: AbortSignal.timeout(this.o.timeoutMs),
        });
      } catch (e) {
        // Network failure or timeout: transient.
        if (attempt >= this.o.maxRetries) {
          throw new MetaApiError({ httpStatus: 0, kind: "transient", message: `Network error contacting Meta: ${(e as Error).name}` });
        }
        await this.o.sleep(this.backoff(attempt++));
        continue;
      }

      this.lastUsage = parseUsageHeaders(res.headers);
      this.o.onUsage?.(this.lastUsage);

      let json: unknown = null;
      const text = await res.text();
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      const errBody = (json as { error?: MetaErrorBody } | null)?.error;
      if (res.ok && !errBody) return json as T;

      const retryAfterMs = this.lastUsage.regainAccessSeconds ? this.lastUsage.regainAccessSeconds * 1000 : undefined;
      const err = new MetaApiError({ httpStatus: res.status, body: errBody ?? { message: `HTTP ${res.status}` }, retryAfterMs });
      if (!err.retryable || attempt >= this.o.maxRetries) throw err;
      if (err.kind === "rate_limit") {
        const wait = retryAfterMs ?? this.backoff(attempt + 2);
        if (wait > this.o.maxInlineWaitMs) throw new MetaApiError({ httpStatus: res.status, body: errBody, retryAfterMs: wait });
        await this.o.sleep(wait);
      } else {
        await this.o.sleep(this.backoff(attempt));
      }
      attempt++;
    }
  }

  get<T>(path: string, params?: Params) {
    return this.request<T>("GET", path, params);
  }

  post<T>(path: string, params?: Params) {
    return this.request<T>("POST", path, params);
  }

  /** Cursor-based pagination using `after` cursors (keeps our auth + proof on every page). */
  async *paginate<T>(path: string, params: Params = {}, maxPages = 10_000): AsyncGenerator<T[]> {
    let after: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const res = await this.get<Paged<T>>(path, { ...params, after });
      yield res.data ?? [];
      const next = res.paging?.cursors?.after;
      if (!res.paging?.next || !next || next === after) return;
      after = next;
    }
  }

  async getAll<T>(path: string, params: Params = {}): Promise<T[]> {
    const out: T[] = [];
    for await (const page of this.paginate<T>(path, params)) out.push(...page);
    return out;
  }
}
