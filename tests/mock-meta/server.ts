// A local stand-in for the Meta Graph API used ONLY by automated tests (and optional local
// manual testing). It implements the subset of documented Marketing API behaviour the sync
// engine relies on, and verifies that every call carries the Bearer token + appsecret_proof.
// Passing tests against this mock proves our integration logic — not live Meta connectivity.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHmac } from "node:crypto";

export interface MockMetaOptions {
  port?: number;
  version?: string;
  appId?: string;
  appSecret?: string;
  validToken?: string;
  /** Number of ads to expose (ads endpoint pages at 2 per page to exercise pagination). */
  ads?: number;
}

export interface MockState {
  mode: string[]; // e.g. ["auth_error"], ["rate_limit"], ["transient_once"], ["reject_field:video_p95_watched_actions"], ["report_pending:2"]
  requests: { method: string; path: string; hadBearer: boolean; proofOk: boolean; tokenInUrl: boolean }[];
  reports: Map<string, { params: Record<string, string>; polls: number }>;
  /** Multiplier applied to purchases to simulate attribution updates. */
  purchaseMultiplier: number;
}

export function adMetrics(adIndex: number, date: string, multiplier = 1) {
  const n = adIndex + 1;
  const day = Number(date.slice(8, 10));
  return { spend: 100 * n + day, impressions: 1000 * n, reach: 800 * n, clicks: 30 * n, linkClicks: 20 * n, outbound: 18 * n, purchases: n * multiplier, value: 500 * n * multiplier };
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

export async function startMockMeta(opts: MockMetaOptions = {}): Promise<{ server: Server; url: string; state: MockState; close: () => Promise<void> }> {
  const version = opts.version ?? "v24.0";
  const appId = opts.appId ?? "1234567890";
  const appSecret = opts.appSecret ?? "test-app-secret";
  const validToken = opts.validToken ?? "EAAB-valid-system-user-token-for-tests";
  const adCount = opts.ads ?? 3;
  const state: MockState = { mode: [], requests: [], reports: new Map(), purchaseMultiplier: 1 };
  let reportSeq = 0;
  let transientServed = false;

  const ads = Array.from({ length: adCount }, (_, i) => ({
    id: `90000${i}`, name: i === adCount - 1 ? `Untagged ad ${i}` : `S25_CR00${i + 1}_Hook${i}`, adset_id: `8000${i % 2}`, campaign_id: "70000",
    status: "ACTIVE", effective_status: "ACTIVE", creative: { id: `60000${i}` }, preview_shareable_link: `https://fb.me/preview${i}`,
    created_time: "2026-09-01T10:00:00+0530", updated_time: "2026-10-01T10:00:00+0530",
  }));

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  const error = (res: ServerResponse, status: number, code: number, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    send(res, status, { error: { message, type: "OAuthException", code, fbtrace_id: "mocktrace", ...extra } }, headers);

  async function body(req: IncomingMessage): Promise<Record<string, string>> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/__control") {
      const b = await body(req);
      if (b.mode !== undefined) state.mode = b.mode ? b.mode.split(",") : [];
      if (b.purchaseMultiplier) state.purchaseMultiplier = Number(b.purchaseMultiplier);
      transientServed = false;
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/__state") return send(res, 200, { mode: state.mode, requests: state.requests.length, reports: state.reports.size });

    const params: Record<string, string> = req.method === "POST" ? await body(req) : Object.fromEntries(url.searchParams);
    const prefix = `/${version}/`;
    if (!url.pathname.startsWith(prefix)) return error(res, 400, 2500, "Unknown path components");
    const path = url.pathname.slice(prefix.length);
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : params.access_token ?? "";
    const isAppToken = token === `${appId}|${appSecret}`;
    const proofOk = isAppToken || params.appsecret_proof === createHmac("sha256", appSecret).update(token).digest("hex");
    state.requests.push({ method: req.method ?? "GET", path, hadBearer: auth.startsWith("Bearer "), proofOk, tokenInUrl: url.searchParams.has("access_token") });

    // ── App-token endpoints ──
    if (path === "debug_token") {
      if (!isAppToken) return error(res, 400, 190, "Invalid app access token");
      const valid = params.input_token === validToken;
      return send(res, 200, { data: { app_id: appId, type: "SYSTEM_USER", is_valid: valid, user_id: "555", scopes: valid ? ["ads_read", "business_management"] : [], expires_at: 0, data_access_expires_at: 0 } });
    }
    if (path === "oauth/access_token") return send(res, 200, { access_token: validToken, token_type: "bearer" });

    // ── User/system-user token endpoints ──
    if (token !== validToken || state.mode.includes("auth_error")) return error(res, 400, 190, "Error validating access token: Session has expired", { error_subcode: 463 });
    if (!proofOk) return error(res, 400, 100, "Invalid appsecret_proof provided in the API argument");
    if (state.mode.includes("rate_limit")) {
      return error(res, 400, 80004, "There have been too many calls to this ad-account.", { is_transient: true }, {
        "x-business-use-case-usage": JSON.stringify({ "123": [{ type: "ads_insights", call_count: 100, total_cputime: 30, total_time: 40, estimated_time_to_regain_access: 5 }] }),
      });
    }
    if (state.mode.includes("transient_once") && !transientServed) {
      transientServed = true;
      return error(res, 500, 2, "An unexpected error has occurred. Please retry your request later.", { is_transient: true });
    }
    const usage = { "x-ad-account-usage": JSON.stringify({ acc_id_util_pct: 3.2, reset_time_duration: 0, ads_api_access_tier: "standard_access" }) };

    if (path === "me") return send(res, 200, { id: "555", name: "Suroskie Sync (system user)" }, usage);
    if (path === "me/adaccounts") {
      return send(res, 200, { data: [{ id: "act_111", account_id: "111", name: "Suroskie India", currency: "INR", timezone_name: "Asia/Kolkata", account_status: 1, business: { id: "123", name: "Suroskie" } }], paging: { cursors: { before: "a", after: "b" } } }, usage);
    }

    const rejected = state.mode.find((m) => m.startsWith("reject_field:"))?.split(":")[1];
    if (rejected && (params.fields ?? "").split(",").includes(rejected)) {
      return error(res, 400, 100, `(#100) ${rejected} is not valid for fields param. Please check https://developers.facebook.com/docs/marketing-api/reference/ads-insights/ for all valid values`);
    }

    if (path === "act_111/campaigns") {
      return send(res, 200, { data: [{ id: "70000", name: "Sales | Prospecting", objective: "OUTCOME_SALES", status: "ACTIVE", effective_status: "ACTIVE", buying_type: "AUCTION", daily_budget: "500000", created_time: "2026-09-01T10:00:00+0530" }], paging: { cursors: { after: "c1" } } }, usage);
    }
    if (path === "act_111/adsets") {
      return send(res, 200, {
        data: [0, 1].map((i) => ({ id: `8000${i}`, name: `Ad set ${i}`, campaign_id: "70000", status: "ACTIVE", effective_status: "ACTIVE", optimization_goal: "OFFSITE_CONVERSIONS", billing_event: "IMPRESSIONS", attribution_spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }, { event_type: "VIEW_THROUGH", window_days: 1 }], promoted_object: { pixel_id: "1", custom_event_type: "PURCHASE" } })),
        paging: { cursors: { after: "s1" } },
      }, usage);
    }
    if (path === "act_111/ads") {
      // Two per page to exercise cursor pagination.
      const start = params.after ? Number(params.after) : 0;
      const page = ads.slice(start, start + 2);
      const more = start + 2 < ads.length;
      return send(res, 200, { data: page, paging: { cursors: { after: String(start + 2) }, ...(more ? { next: `https://graph.facebook.com/${version}/act_111/ads?after=${start + 2}` } : {}) } }, usage);
    }
    if (path === "" && params.ids) {
      const out: Record<string, unknown> = {};
      for (const id of params.ids.split(",")) {
        const i = Number(id.slice(-1));
        out[id] = { id, name: `Creative ${i}`, object_type: i % 2 === 0 ? "VIDEO" : "PHOTO", video_id: i % 2 === 0 ? `v${i}` : undefined, thumbnail_url: `https://scontent.fbcdn.net/thumb${i}.jpg`, image_url: i % 2 ? `https://scontent.fbcdn.net/img${i}.jpg` : undefined };
      }
      return send(res, 200, out, usage);
    }
    if (path === "act_111/insights" && req.method === "POST") {
      const id = `rr_${++reportSeq}`;
      state.reports.set(id, { params, polls: 0 });
      return send(res, 200, { report_run_id: id }, usage);
    }
    const rr = path.match(/^(rr_\d+)(\/insights)?$/);
    if (rr) {
      const report = state.reports.get(rr[1]);
      if (!report) return error(res, 400, 100, "Unsupported get request");
      if (!rr[2]) {
        report.polls++;
        const pending = Number(state.mode.find((m) => m.startsWith("report_pending:"))?.split(":")[1] ?? 1);
        if (state.mode.includes("report_failed")) return send(res, 200, { id: rr[1], async_status: "Job Failed", async_percent_completion: 0 });
        const done = report.polls > pending;
        return send(res, 200, { id: rr[1], async_status: done ? "Job Completed" : "Job Running", async_percent_completion: done ? 100 : 50 });
      }
      const tr = JSON.parse(report.params.time_range);
      const fields = report.params.fields.split(",");
      const breakdowns = report.params.breakdowns?.split(",") ?? [];
      const rows: Record<string, unknown>[] = [];
      for (const date of eachDay(tr.since, tr.until)) {
        ads.forEach((ad, i) => {
          const m = adMetrics(i, date, state.purchaseMultiplier);
          const base: Record<string, unknown> = {
            account_id: "111", campaign_id: ad.campaign_id, campaign_name: "Sales | Prospecting", adset_id: ad.adset_id, adset_name: `Ad set ${Number(ad.adset_id.slice(-1))}`,
            ad_id: ad.id, ad_name: ad.name, date_start: date, date_stop: date, account_currency: "INR",
            spend: m.spend.toFixed(2), impressions: String(m.impressions), reach: String(m.reach), clicks: String(m.clicks), inline_link_clicks: String(m.linkClicks),
            outbound_clicks: [{ action_type: "outbound_click", value: String(m.outbound) }],
            // Overlapping purchase types, as Meta reports them: must not be double counted.
            actions: [
              { action_type: "link_click", value: String(m.linkClicks) },
              { action_type: "landing_page_view", value: String(m.linkClicks - 2) },
              { action_type: "omni_purchase", value: String(m.purchases) },
              { action_type: "purchase", value: String(m.purchases) },
              { action_type: "offsite_conversion.fb_pixel_purchase", value: String(m.purchases) },
              ...(i % 2 === 0 ? [{ action_type: "video_view", value: String(m.impressions / 4) }] : []),
            ],
            action_values: [
              { action_type: "omni_purchase", value: String(m.value) },
              { action_type: "purchase", value: String(m.value) },
              { action_type: "offsite_conversion.fb_pixel_purchase", value: String(m.value) },
            ],
            optimization_goal: "OFFSITE_CONVERSIONS", objective: "OUTCOME_SALES", attribution_setting: "7d_click_1d_view",
          };
          if (i % 2 === 0) {
            for (const f of ["video_play_actions", "video_thruplay_watched_actions", "video_p25_watched_actions", "video_p50_watched_actions", "video_p75_watched_actions", "video_p95_watched_actions", "video_p100_watched_actions"]) {
              base[f] = [{ action_type: "video_view", value: String(Math.round(m.impressions / (f.includes("thru") ? 10 : 5))) }];
            }
            base.video_avg_time_watched_actions = [{ action_type: "video_view", value: "6.5" }];
          }
          for (const k of Object.keys(base)) if (!fields.includes(k)) delete base[k];
          if (breakdowns.length) {
            const dims = breakdowns.includes("age") ? [["25-34", "female"], ["25-34", "male"]] : breakdowns.includes("publisher_platform") ? [["instagram", "reels"], ["facebook", "feed"]] : [["mobile_app"], ["desktop"]];
            for (const d of dims) {
              const r: Record<string, unknown> = { ...base, spend: (m.spend / 2).toFixed(2), impressions: String(m.impressions / 2) };
              breakdowns.forEach((b, bi) => (r[b] = d[bi] ?? "unknown"));
              rows.push(r);
            }
          } else rows.push(base);
        });
      }
      const start = params.after ? Number(params.after) : 0;
      const pageSize = 4;
      const more = start + pageSize < rows.length;
      return send(res, 200, { data: rows.slice(start, start + pageSize), paging: { cursors: { after: String(start + pageSize) }, ...(more ? { next: "https://graph.facebook.com/next" } : {}) } }, usage);
    }
    return error(res, 400, 100, `Unsupported request in mock: ${req.method} ${path}`);
  });

  await new Promise<void>((r) => server.listen(opts.port ?? 0, "127.0.0.1", () => r()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;
  return { server, url: `http://127.0.0.1:${port}`, state, close: () => new Promise((r) => server.close(() => r())) };
}

// `npx tsx tests/mock-meta/server.ts` runs it standalone on port 4010 for manual local testing.
if (process.argv[1]?.endsWith("server.ts")) {
  startMockMeta({ port: Number(process.env.MOCK_META_PORT ?? 4010) }).then((m) => console.log(`Mock Meta Graph API on ${m.url} (token: EAAB-valid-system-user-token-for-tests)`));
}
