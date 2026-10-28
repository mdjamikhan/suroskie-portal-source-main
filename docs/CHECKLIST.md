# Delivery checklist

Legend:

| Mark | Meaning |
|---|---|
| ✅ | Implemented **and** covered by automated tests |
| 🟢 | Implemented; checked manually in the browser, no dedicated automated test |
| 🟡 | Implemented, but depends on external configuration not available during the build (Meta credentials, SMTP, hosting) |
| ⏳ | Not implemented |

## Core workflow (acceptance criteria)

| # | Criterion | Status |
|---|---|---|
| 1 | Super admin signs in | ✅ e2e |
| 2 | Admin connects an authorised Meta ad account | ✅ against mock Graph API · 🟡 live Meta |
| 3 | Imports campaigns, ad sets, ads and performance | ✅ against mock · 🟡 live Meta |
| 4 | Admin maps ads to creators | ✅ |
| 5 | Admin invites a content team member | ✅ (link shown to admin) · 🟡 email delivery needs SMTP |
| 6 | Assigns selected creators and specific metrics | ✅ |
| 7 | Member signs in and searches for an authorised creator | ✅ |
| 8 | Accurate, date-filtered performance from synced data | ✅ |
| 9 | Cannot reach other creators' data or restricted metrics via API, URL or exports | ✅ |
| 10 | Automatic refresh and last-successful-sync display | ✅ (cron endpoints tested) · 🟡 GitHub Actions secrets and schedule need production setup |

## By area

| Area | Item | Status |
|---|---|---|
| **Meta** | Typed Graph API client, Bearer auth, `appsecret_proof`, timeouts | ✅ |
| | Pagination (cursor), retries with backoff, usage-header throttling | ✅ |
| | Expired token, permission, rate limit and transient error handling | ✅ |
| | Async insights reports, resumable polling, split on failure | ✅ |
| | Rejected-field fallback marks metrics unsupported (dynamic catalogue) | ✅ |
| | System-user token connection with `debug_token` validation; ad account discovery | ✅ mock · 🟡 live |
| | Facebook Login OAuth (state cookie, long-lived token exchange) | 🟢 code path implemented; not exercised in tests · 🟡 live |
| | Multiple connections and multiple ad accounts | ✅ |
| | Creative thumbnails and Meta preview links | ✅ mock · 🟡 live URLs |
| **Sync** | Hourly recent refresh, daily 28-day attribution refresh, 37-month chunked backfill | ✅ |
| | Postgres job queue: leases, crash recovery, dedupe, one job per account | ✅ |
| | Idempotent upserts, revision history on attribution changes | ✅ |
| | Manual sync and historical resync range | ✅ API · 🟢 UI |
| | GitHub Actions cron workflow and standalone worker | 🟢 / 🟡 |
| | Data retention housekeeping | 🟢 |
| **Mapping** | Creators (ID, name, handle, image, notes, status, team, owner) | ✅ |
| | Creative assets (type, angle, hook, product, tags, launch date, notes) | ✅ API · 🟢 UI |
| | Manual, bulk and reassignment; unmap; one creator per ad | ✅ |
| | Unmapped review queue; mapping history; audit | ✅ |
| | Naming-convention rules (token match, prefix, priority, ambiguity guard, never overrides) | ✅ |
| **Metrics** | Delivery, conversion, video and engagement catalogue (51 metrics) | ✅ |
| | Results / cost per result derived from optimisation goal | ✅ |
| | Explicit zero / n/a / unavailable / no-data states; reach labelled as bound | ✅ |
| | Mixed-currency guard; INR formatting; Asia/Kolkata presets | ✅ |
| | Breakdowns: age·gender, placement, device, country, region | ✅ ingest · 🟢 UI |
| **Reports** | Overview, creator page, leaderboard (thresholds and low-sample warnings), compare, campaigns/ad sets/ads | ✅ services · 🟢 UI |
| | Period-over-period comparison | ✅ |
| | Server-side sorting and pagination | ✅ |
| | CSV exports (scoped, metric-filtered, injection-safe, audited) | ✅ |
| **Access** | Default and custom roles; per-user permission, metric, account, creator, look-back and earliest-date overrides | ✅ |
| | Enforcement in SQL and response projection | ✅ |
| | Privilege-escalation guards; Super Admin protections | ✅ |
| | Navigation shows only authorised sections | 🟢 |
| **Users** | Invite-only; hashed single-use 72 h tokens; suspend, reactivate, revoke sessions | ✅ |
| | Password reset | 🟢 code path · 🟡 needs SMTP |
| | Last login and activity on user page | 🟢 |
| **Security** | Session auth, CSRF origin checks, rate limits, security headers, safe errors, env validation | ✅ |
| | Token encryption at rest; tokens never returned by APIs | ✅ |
| | Audit log of sensitive actions including exports | ✅ |
| **UI** | Dark sidebar, filters, charts, skeletons, empty and error states, demo labelling | 🟢 |
| | Responsive: no horizontal page overflow at 390 px on every page | 🟢 (tables scroll inside their cards) |
| **Deliverables** | Source, schema and migrations, seed, `.env.example`, Dockerfile, CI, `vercel.json`, docs | ✅ |

## Pending or not implemented

| Item | Notes |
|---|---|
| ⏳ Live verification against Meta | Needs your Meta app credentials and a system-user token. Follow "First live run" in META_SETUP.md. |
| ⏳ PDF reports | CSV only. Any future PDF should reuse `buildExport()` to keep the same access rules. |
| ⏳ Multi-creator split attribution | Each ad credits exactly one creator, by design. Splitting credit (for example collaborations) would need a share column on `ad_creator_mapping`. |
| ⏳ Two-factor authentication | Better Auth offers a 2FA plugin; recommended for Super Admins. |
| ⏳ Embedded video playback | Thumbnails plus Meta's shareable preview link. No in-app video player. |
| ⏳ Automated browser (UI) tests | UI checked manually with Playwright screenshots; tests cover services and HTTP. |

## Known limitations

1. **Reach and frequency** are only exact for a single ad on a single day. Meta de-duplicates reach, so the portal shows summed daily reach labelled `≤` (upper bound), and frequency as a lower bound.
2. **Time zones:** Meta reports days in the ad account's time zone. The reporting time zone controls "today" and the presets but can't re-bucket Meta's daily rows. A notice appears when they differ.
3. **"Unsupported metric" flags are global**, not per ad account.
4. **Structure sync lists all campaigns, ad sets and ads every hour.** That's fine for typical accounts. Very large accounts (tens of thousands of ads) would benefit from `updated_time` filtering.
5. **Sample-size warnings are heuristics** (minimum spend, purchases and impressions), not statistical significance tests.
6. **Exports are capped at 10,000 rows** per file.
7. **Sign-in rate limiting is keyed by client IP** from `X-Forwarded-For`. Deploy behind a proxy that sets it correctly.
8. **Results** come from the optimisation goal. Goals the portal doesn't recognise show results as unavailable rather than guessing.
9. **Breakdown reports** cover spend, impressions, reach, clicks, link clicks, purchases and value. Video metrics aren't broken down.
10. **Demo mode** is instance-wide. Demo creators (codes `DEMO-…`) are stored alongside real creators and have no data in real mode. Run `npm run demo:clear` before going live.
