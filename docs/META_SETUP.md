# Meta app setup and connecting real ad accounts

The portal reads advertising data with the official Meta Graph / Marketing API. It **only reads**: it never creates, edits or pauses campaigns.

> **Verification status.** The integration has been tested end-to-end against a local mock of the Graph API that enforces the Bearer token, `appsecret_proof`, async insights reports, cursor pagination and Meta's error codes (see `tests/mock-meta/server.ts`). It has **not** been run against a live Meta app because no credentials were available while it was built. Before relying on it, complete the "First live run" checklist at the end of this page.
>
> Meta changes its app types, access tiers and review requirements often. Where this page describes Meta's process, confirm the current steps in the App Dashboard and Meta's documentation.

## 1. What the portal calls

| Purpose | Endpoint | Token |
|---|---|---|
| Validate a token | `GET /debug_token?input_token=…` | App access token (`APP_ID|APP_SECRET`) |
| Identify the token owner | `GET /me?fields=id,name` | Connection token |
| Discover ad accounts | `GET /me/adaccounts?fields=id,account_id,name,currency,timezone_name,account_status,business{id,name}` | Connection token |
| Structure | `GET /act_<id>/campaigns`, `/adsets`, `/ads` (cursor pagination, `limit=200`) | Connection token |
| Creatives and thumbnails | `GET /?ids=<creative ids>&fields=…&thumbnail_width=480&thumbnail_height=480` | Connection token |
| Daily insights | `POST /act_<id>/insights` (async) → `GET /<report_run_id>` → `GET /<report_run_id>/insights` | Connection token |
| OAuth (optional) | `www.facebook.com/<ver>/dialog/oauth`, `GET /oauth/access_token` (code exchange and long-lived exchange) | App credentials |

Insights parameters: `level=ad`, `time_increment=1`, `use_unified_attribution_setting=true`, and the breakdowns `age,gender` / `publisher_platform,platform_position` / `device_platform` / `country` / `region`. The full field lists are in `src/lib/meta/fields.ts`.

Every request sends the token in the `Authorization: Bearer` header and includes `appsecret_proof` (an HMAC-SHA256 of the token keyed with the app secret).

**API version:** `META_API_VERSION`, default `v24.0`. This matches the version of Meta's official Node Business SDK published at build time. Meta's API also accepted `v25.0` and `v26.0` requests at that time. Before upgrading, read the Marketing API changelog. If Meta removes a field, the sync drops it and marks the dependent metrics *unsupported* (Settings → Metric catalogue) instead of failing.

## 2. Create the Meta app

1. At <https://developers.facebook.com/apps>, create an app of type **Business** owned by Suroskie's Business portfolio.
2. Add the **Marketing API** product. If you plan to use Facebook Login, also add **Facebook Login for Business**.
3. Under **App settings → Basic**, copy the **App ID** and **App Secret** into `META_APP_ID` and `META_APP_SECRET` on the server. The secret is never sent to the browser.
4. Recommended: under **App settings → Advanced**, enable **Require app secret**. The portal already sends `appsecret_proof` on every call.
5. Keep the app in the mode Meta recommends for internal tools. Apps that only read the business's own ad accounts with a system-user token generally work with **Standard Access** for `ads_read`.

### Permissions

| Permission | Why |
|---|---|
| `ads_read` | **Required.** Read campaigns, ad sets, ads, creatives and insights. |
| `business_management` | Optional. Lists business-owned ad accounts and lets Facebook Login reach accounts through the business. |

The portal checks for `ads_read` when a token is connected and rejects tokens issued for a different app.

### Access level, business verification and App Review

* Reading your **own** business's ad accounts with a system user of your business usually needs only **Standard Access**, with no App Review. Standard Access has lower rate limits; the portal respects them and backs off.
* **Advanced Access** to `ads_read` (higher limits, or accounts owned by other businesses) requires **business verification** and **App Review**. Apply under **App Review → Permissions and Features**, describe the read-only reporting use case, and provide a screencast of the portal.
* Each ad account's current tier appears in the `x-ad-account-usage` header (`ads_api_access_tier`). The sync records it with each account's rate-limit state.

## 3. Connect ad accounts: Option A, system user token (recommended)

A system user is a non-human identity owned by the business. Its token doesn't depend on any employee's Facebook account and can be generated without an expiry.

1. Open **Meta Business Suite → Settings → Users → System users**. Add a system user (role: *Employee* is enough for read-only).
2. **Assign assets.** Add each ad account the portal should report on, with the read/"view performance" permission. Management permission isn't needed.
3. Assign the system user to your app (**Settings → Accounts → Apps**: add the app and assign the system user).
4. Click **Generate new token**. Select your app, choose the expiry (**Never** is available for system users), and tick `ads_read` (and `business_management` if needed).
5. In the portal, sign in as a Super Admin and go to **Integrations → Option A**. Paste the token and click **Validate & connect**.
   * The portal calls `/debug_token`, rejects the token if it's invalid, belongs to another app, or lacks `ads_read`, then encrypts it (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`) and discovers the ad accounts.
   * The token is never shown again or returned by any API. The form clears itself.
6. Under **Integrations → Ad accounts**, switch **Sync** on for each account you want. Enabling an account:
   * starts the initial historical import (up to 37 months, newest first, in 30-day chunks);
   * starts hourly and daily refreshes from the next scheduler run.

   You can also click **Sync now** on the Ad accounts page.

To rotate a token, generate a new one, connect it as a new connection, run **Discover accounts** (accounts move to the new connection automatically), then **Disconnect** the old one.

## 4. Connect ad accounts: Option B, Facebook Login

Use this when a system user isn't possible. The token belongs to the admin who signs in, lasts about 60 days, and stops working if that person loses access, so reconnect before it expires (Integrations shows the expiry).

1. In the app's Facebook Login settings, add the **Valid OAuth Redirect URI** shown on the Integrations page: `https://<APP_URL>/api/v1/admin/meta/oauth/callback`.
2. Optional: if you use *Facebook Login for Business*, create a configuration with `ads_read` (and `business_management`) and set its ID in `META_LOGIN_CONFIG_ID`.
3. On **Integrations → Option B**, click **Continue with Facebook**.
   * The flow is protected by a `state` cookie.
   * The code is exchanged server-side for a long-lived token, which is validated, encrypted and stored.

## 5. What happens when things go wrong

| Situation | What the portal does | What you do |
|---|---|---|
| Token expired or revoked (error 190) | Connection becomes **expired**; accounts show **failing**; syncing stops | Reconnect (generate a new token) |
| Missing permission for an account (10 / 2xx) | Job fails and the account shows **failing** with Meta's message | Check the system user's asset assignment |
| Rate limited (4 / 17 / 613 / 80000–80014) | Account paused until Meta's reported recovery time, then resumes automatically | Nothing; consider Advanced Access if it happens often |
| Meta outage or transient error | Automatic retries with backoff (up to 6 attempts) | Nothing |
| Field removed in a new API version | Field skipped; dependent metrics shown as *unavailable*, never zero | Review the changelog; reset the metric in Settings if Meta restores it |

## 6. First live run checklist

1. Set `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENCRYPTION_KEY` and `DEMO_MODE=false`.
2. Connect a system-user token for **one** low-volume ad account and enable sync.
3. Trigger **Sync now**. Watch **Ad accounts → Recent sync jobs** until structure and insights jobs show *succeeded*.
4. Reconcile one ad and one day against Ads Manager, using the same attribution setting and the account's time zone. Check: amount spent, impressions, link clicks, purchases (Ads Manager "Purchases"), purchase conversion value and ROAS. Small differences can appear for the current day while Meta is still processing.
5. Check **Settings → Metric catalogue** for metrics marked *unsupported* by your API version.
6. Enable the remaining accounts.

Please share any discrepancy from step 4 along with the ad ID and date. The parsing rules are in `src/lib/meta/parse.ts` and covered by unit tests.
