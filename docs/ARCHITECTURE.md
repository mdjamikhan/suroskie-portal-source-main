# Architecture

## Overview

```
Browser ──► Next.js (App Router, server components) ──► Report services ──► Postgres (reporting layer)
                 │                                                       ▲
                 └─► /api/v1/* (JSON, CSV)                               │ idempotent upserts
                                                                         │
GitHub Actions schedule / npm run worker ──► scheduler ──► sync_job queue ──► worker ──► Meta Graph API
```

* **The database is the reporting layer.** Opening a page never calls Meta. All Meta traffic comes from the background sync.
* **Server-only data access.** Pages are server components that call the report services directly. Client components get already-projected data. Tokens, the database and Meta calls never reach the browser. `src/lib/db.ts` imports `server-only`, so importing it into a client bundle fails the build.
* **Cache Components (Next 16).** Every authenticated page streams inside `<Suspense>` and reads the session on each request. Permission-scoped data is never put in `use cache`, so revocations apply immediately.

## Authentication

* **Better Auth** handles email/password and database sessions (12-hour TTL, rolling hourly). Cookies are `httpOnly`, `SameSite=Lax`, and `Secure` on HTTPS. The cookie cache is disabled, so every request re-validates the session row.
* **Sign-up is disabled.** Users exist only through invitations. The invitation token is 32 random bytes, stored as SHA-256, single use, and valid for 72 hours.
* A `databaseHooks.session.create.before` hook blocks sign-in for suspended or invited users. Suspension deletes all sessions.
* **Rate limits** are stored in Postgres, so they work across instances:
  * sign-in: 5 per minute
  * password reset request: 3 per 5 minutes
  * API: 240 reads and 60 writes per minute per user
  * exports: 20 per minute
* **CSRF:**
  * Better Auth validates `Origin` against `APP_URL`.
  * Our API routes reject cross-origin non-GET requests (`Origin` / `Sec-Fetch-Site`).
  * The OAuth flow uses a `state` cookie.
* `src/proxy.ts` redirects requests with no session cookie to `/login` before rendering. This is an optimistic check only; the real check runs in `requireAccess()`.

## Authorization model

`AccessContext` (`src/lib/access/context.ts`) is resolved from the database on **every** request:

| Dimension | Source | Resolution |
|---|---|---|
| Permissions (capabilities) | role permissions ∪ per-user grants − per-user denials | deny wins |
| Metrics | role metrics ∪ per-user grants − per-user denials | deny wins; unknown keys ignored |
| Ad accounts | `ALL` if any role or a user override says so, else assigned list | |
| Creators | `ALL` if any role or a user override says so, else assigned list (unmapped ads only visible with `ALL`) | |
| Date window | user look-back override, else the most permissive role; plus a hard "no data before" date | clamped server-side |
| Super Admin | everything; cannot be edited by non-super-admins; the last active super admin is protected | |

Enforcement points:

1. **SQL.** `scopeWhere()` (`src/lib/reporting/queries.ts`) adds the account scope, creator scope, demo/real separation and the clamped dates to every aggregation. Request filters are *intersected* with scope, so asking for another creator's ID returns nothing. An empty scope compiles to `AND FALSE`, never to "everything".
2. **Projection.** `projectMetrics()` removes every metric key the user can't see before serialization: KPIs, chart points, table rows and exports. Sorting by a hidden metric is silently replaced.
3. **Guards.** `requirePermission`, `assertCreatorAccess` and `assertAdAccountAccess` run in every service and route. Restricted creator IDs return the same "not found or not accessible" response, so IDs can't be probed.
4. **Privilege escalation.** A non-super-admin with `users.manage` can't grant any role, permission, metric, account or creator they don't hold, can't grant the Super Admin role, and can't edit Super Admins. Only Super Admins edit roles. Naming rules (global effect) require unrestricted scope.

## Data model (main tables)

| Table | Purpose / key constraints |
|---|---|
| `user`, `session`, `account`, `verification`, `rate_limit` | Better Auth tables, plus `status`, scope overrides and look-back on `user` |
| `role`, `permission`, `role_permission`, `role_metric`, `user_role`, `user_permission_override`, `user_metric_override`, `user_ad_account_access`, `user_creator_access` | RBAC. Composite primary keys prevent duplicates. |
| `invitation` | `tokenHash` unique; `expiresAt`, `acceptedAt`, `revokedAt` |
| `meta_connection` | `encryptedToken` (AES-256-GCM), scopes, expiry, status. Never selected into API responses. |
| `ad_account` | `metaAccountId` unique; currency, time zone, `syncEnabled`, `isDemo`, sync health and freshness timestamps, rate-limit pause |
| `campaign`, `ad_set`, `ad`, `ad_creative` | Meta objects keyed by unique Meta IDs; status, objective, optimisation goal, attribution spec, thumbnails |
| `creator`, `creative_asset` | `code` (Creator ID) unique, Instagram handle unique; assets carry type, angle, hook, product, tags and launch date |
| `ad_creator_mapping` | **`adId` unique**: one creator per ad (no double counting). Records method (manual, bulk or naming rule). |
| `mapping_change` | Append-only history of every mapping change |
| `naming_rule` | Token-based auto-mapping rules |
| `ad_insight_daily` | **Unique `(adId, date)`**. Typed metric columns (nullable means "not reported"), raw `actions`/`action_values` JSON, derived results, `contentHash`, `revision` |
| `ad_insight_revision` | Previous values whenever Meta revises a day (attribution updates) |
| `ad_insight_breakdown_daily` | Unique `(adId, date, breakdownType, dim1, dim2)` |
| `sync_job`, `sync_job_event` | Queue with status, priority, `runAfter`, lease, attempts, resumable `state`. A partial unique index on `dedupeKey` covers QUEUED/RUNNING jobs. |
| `audit_log` | Append-only log of sensitive actions |
| `app_setting`, `metric_definition` | Settings; metric catalogue with `isSupported` maintained by the sync |

There are also check constraints (non-negative spend and impressions, `dateFrom ≤ dateTo`) and trigram indexes for creator and ad name search.

## Sync pipeline

| Schedule | Work |
|---|---|
| Daily (`/api/cron/sync`, 00:07 UTC) | Structure discovery (campaigns → ad sets → ads → creatives), insights for the last `recentRefreshDays` (default 3), and the daily attribution refresh |
| Once per account | Backfill in 30-day chunks, newest first, back to `backfillMonths` (default 37, Meta's insights retention) |
| Once per account | Backfill in 30-day chunks, newest first, back to `backfillMonths` (default 37, Meta's insights retention) |
| Every 5 min (`/api/cron/worker`) | Drain the queue, so backfills progress |

* **Insights:** `POST /act_<id>/insights` with `level=ad`, `time_increment=1`, `use_unified_attribution_setting=true` (each ad set's own attribution setting, matching Ads Manager), then poll `/<report_run_id>` and page through `/<report_run_id>/insights`. The report ID is stored in `sync_job.state`, so a short serverless invocation can resume it. If Meta fails a report on a window over 7 days, the job splits into halves.
* **Idempotency:** each row is keyed `(ad, date)`. Unchanged rows are skipped by content hash. Changed rows bump `revision` and copy the old values to `ad_insight_revision`. Deleted or archived ads seen in insights get stub rows, so history isn't lost.
* **Errors:**

  | Error type | Handling |
  |---|---|
  | Auth (190 / 102) | Job fails; connection marked EXPIRED; account FAILING; scheduler stops until reconnected |
  | Permission (10 / 2xx) | Job fails; account FAILING |
  | Rate limit (4 / 17 / 32 / 613 / 80000–80014) | Account paused until Meta's `estimated_time_to_regain_access`; job requeued without consuming an attempt |
  | Transient (1 / 2 / 5xx / network) | Exponential backoff with jitter inline, then queue backoff (2^n min, up to 6 attempts) |
  | Field rejected (100) | Field dropped and request retried; dependent metrics marked `unsupported` |

* **Throttling:** the client reads `x-app-usage`, `x-ad-account-usage` and `x-business-use-case-usage` and slows down above 75% / 90% utilisation.
* **Concurrency:** one running job per ad account (claimed with `FOR UPDATE SKIP LOCKED`). Leases are 10 minutes and extended while working; jobs from crashed workers are recovered.

## Metric definitions

| Metric | Definition |
|---|---|
| Purchases | First present of `omni_purchase` → `purchase` → `offsite_conversion.fb_pixel_purchase` (overlapping types are never summed) |
| Purchase conversion value | Same precedence over `action_values` |
| Purchase ROAS | Σ purchase value ÷ Σ spend |
| Cost per purchase | Σ spend ÷ Σ purchases |
| CTR (link) / CPC (link) | Link clicks ÷ impressions × 100 / spend ÷ link clicks (`inline_link_clicks`) |
| CTR (all) / CPC (all) | `clicks` based |
| CPM | Σ spend ÷ Σ impressions × 1000 |
| Outbound CTR / cost per outbound click | `outbound_clicks` based |
| Reach / frequency | Summed daily reach. Labelled an **upper bound** (reach) and **lower bound** (frequency) when aggregated over more than one day or ad, because Meta's de-duplicated reach can't be summed. |
| Results / cost per result | Derived from each ad set's optimisation goal and promoted-object event. Shown only when every row has the same result type. |
| Video | 3-second plays (`video_view`), ThruPlays, 25/50/75/95/100% plays, average play time (play-weighted estimate when aggregated). Hook rate and ThruPlay rate are portal-derived and labelled as such. |

States: `ok` (including real zeros), `not_applicable` (for example a zero denominator, or video metrics with no video), `unavailable` (not reported, unsupported, or mixed currencies), `missing` (no synced data). Money is never summed across currencies.

Purchases are Meta-attributed conversions, not unique customers, and conversion value is not necessarily incremental revenue. Rankings show Meta attribution, not causal contribution. The UI states this on every report page.

## Time zones

"Today" and the presets are computed in the configured reporting time zone (default `Asia/Kolkata`). Meta reports each day in the **ad account's** time zone. The portal can't re-bucket Meta's daily data, so when an account's time zone differs from the reporting time zone, report headers say so.
