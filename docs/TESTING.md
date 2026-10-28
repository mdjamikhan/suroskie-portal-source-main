# Testing

## Running the tests

```bash
# One-time: a dedicated test database (never point tests at dev/prod; the harness refuses other names)
createdb suroskie_test
export TEST_DATABASE_URL="postgresql://USER:PASS@localhost:5432/suroskie_test?schema=public"   # optional; this is the default URL

npm run test:unit          # pure logic, no database (~2 s)
npm run test:integration   # real Postgres: scoping, aggregation, sync pipeline vs. mock Meta, users, exports (~10 s)
npm run test:e2e           # next build + next start + mock Meta, full acceptance workflow over HTTP (~1–2 min)
npm test                   # everything
```

`E2E_SKIP_BUILD=1 npm run test:e2e` reuses an existing `.next` build. `E2E_VERBOSE=1` shows server logs. CI is defined in `.github/workflows/ci.yml` and runs type-check, lint and all three suites against a Postgres 16 service.

### About the Meta mock

`tests/mock-meta/server.ts` is a local stand-in for the documented Graph API endpoints the sync uses: `debug_token`, `me`, `me/adaccounts`, campaigns/ad sets/ads with cursor pagination, creative lookup by ids, async insights reports with polling, and breakdowns. It **rejects** requests without the Bearer token or a valid `appsecret_proof`, and it can inject failures: expired token (190), rate limit (80004 with usage headers), transient 500, rejected field (100), failed async job, and attribution changes.

Passing tests show the integration logic is correct against the documented API contract. They do **not** show live connectivity to Meta. See the "First live run" checklist in [META_SETUP.md](META_SETUP.md).

## Latest results

Run on 2026-10-27, Node 22, PostgreSQL 16, Next.js 16.4.3 production build:

```
 Test Files  10 passed (10)
      Tests  130 passed (130)
```

Type-check (`tsc --noEmit`): clean. ESLint: 0 errors, 3 warnings (intentional full-page navigation after sign-out; unused parameter names in a test mock).

### Coverage by requirement

| Requirement | Where it's tested |
|---|---|
| Authentication (sign-in, wrong password, no public sign-up, invitation flow, password rules) | e2e acceptance 1, 5–7; integration admin › invitations |
| Role-based access and privilege escalation | unit access; integration admin › "non-super-admins cannot grant…" |
| Creator-level restrictions | integration reporting-scope › creator-level restrictions; e2e 7–9 |
| Metric visibility (projection, hidden-metric sorting, exports) | integration reporting-scope; integration admin › exports; e2e 9 |
| API authorization and direct URL access | e2e 9 (other creator IDs, `creator=` injection, compare, admin APIs, page URLs), security controls |
| Data aggregation, ROAS and CPA | unit metrics; integration reporting-scope › aggregation accuracy; e2e 8 |
| Date filtering and date permissions | unit date-range; integration reporting-scope (inclusive ranges, clamping) |
| Duplicate prevention and idempotency | integration sync-pipeline › idempotent re-sync, dedupe; admin › one creator per ad |
| Meta API failures | unit meta-client; integration sync-pipeline › failure handling |
| Export permissions | integration admin › exports; e2e 9 (403) and CSV download |
| Demo isolation | integration reporting-scope › "never mixes demo data" |
| Suspension, CSRF, rate limiting, security headers, audit log | e2e security controls |

### Full list of passing tests

```
unit · metrics › metric calculations > computes ROAS as purchase value ÷ spend from totals (not an average of ratios)
unit · metrics › metric calculations > computes cost per purchase as spend ÷ purchases
unit · metrics › metric calculations > never divides by zero: zero denominators are 'not applicable', not Infinity or 0
unit · metrics › metric calculations > distinguishes missing data (no rows) from zero
unit · metrics › metric calculations > marks metrics Meta did not report as unavailable
unit · metrics › metric calculations > video metrics are not applicable when no video delivered
unit · metrics › metric calculations > reach is labelled an upper bound when summed across days/ads; single ad-day is exact
unit · metrics › metric calculations > refuses to add money across currencies
unit · metrics › metric calculations > does not add results of different types
unit · metrics › metric calculations > marks metrics unsupported by the connected API as unavailable
unit · metrics › metric calculations > projects only allowed metrics
unit · metrics › metric calculations > CTR/CPC/CPM follow Meta definitions
unit · metrics › metric calculations > percent change handles zero previous
unit · metrics › formatting > uses INR and Indian digit grouping
unit · metrics › formatting > renders states distinctly
unit · metrics › formatting > warns when hidden spend can be derived
unit · meta-client › MetaClient > sends the token only in the Authorization header and adds appsecret_proof
unit · meta-client › MetaClient > retries transient errors then succeeds
unit · meta-client › MetaClient > does not retry auth errors
unit · meta-client › MetaClient > hands long rate-limit waits back to the queue with retryAfterMs
unit · meta-client › MetaClient > retries network failures and eventually reports them as transient
unit · meta-client › MetaClient > follows cursor pagination until there is no next page
unit · meta-client › MetaClient > parses usage headers
unit · access › access resolution > unions role permissions and metrics and applies scopes
unit · access › access resolution > per-user denials beat role grants (hide spend, disable export)
unit · access › access resolution > ignores unknown permission and metric keys
unit · access › access resolution > super admin gets everything
unit · access › access resolution > suspended and invited users have no access
unit · access › access resolution > a user with no roles sees nothing
unit · access › access resolution > request filters can only narrow scope, never widen it
unit · access › access resolution > guards throw ForbiddenError
unit · meta-parse › insight parsing > does not double count overlapping purchase action types
unit · meta-parse › insight parsing > treats a missing conversion action on a delivered row as zero, but missing video fields as null
unit · meta-parse › insight parsing > sums video list fields
unit · meta-parse › insight parsing > derives results from the optimisation goal
unit · meta-parse › insight parsing > hash changes only when values change
unit · meta-parse › insight parsing > budgets are converted from minor units
unit · meta-parse › insight parsing > parses Meta timestamps with compact offsets
unit · meta-parse › insight parsing > classifies creative types
unit · meta-parse › Meta error classification > HTTP 400 code 190 → auth
unit · meta-parse › Meta error classification > HTTP 400 code 102 → auth
unit · meta-parse › Meta error classification > HTTP 400 code 4 → rate_limit
unit · meta-parse › Meta error classification > HTTP 400 code 17 → rate_limit
unit · meta-parse › Meta error classification > HTTP 400 code 613 → rate_limit
unit · meta-parse › Meta error classification > HTTP 400 code 80004 → rate_limit
unit · meta-parse › Meta error classification > HTTP 400 code 10 → permission
unit · meta-parse › Meta error classification > HTTP 403 code 200 → permission
unit · meta-parse › Meta error classification > HTTP 500 code 2 → transient
unit · meta-parse › Meta error classification > HTTP 400 code 1 → transient
unit · meta-parse › Meta error classification > HTTP 400 code 100 → invalid_request
unit · meta-parse › Meta error classification > detects a rejected field so it can be dropped
unit · date-range › date ranges > computes 'today' in the reporting time zone
unit · date-range › date ranges > presets exclude today for last N days
unit · date-range › date ranges > validates custom ranges
unit · date-range › date ranges > clamps to the user's authorised window
unit · date-range › date ranges > previous period has equal length and ends the day before
unit · misc › naming rules > matches whole tokens only
unit · misc › naming rules > maps a unique match and refuses ambiguous names
unit · misc › naming rules > supports prefixes, handles and other name sources; disabled rules are ignored
unit · misc › CSV export safety > neutralises formula injection and quotes
unit · misc › token encryption > round-trips and uses a fresh IV
unit · misc › token encryption > detects tampering
unit · misc › sync planning > chunks history newest-first without gaps or overlap
unit · misc › sync planning > dedupe keys identify the unit of work
e2e · acceptance › acceptance workflow > 1. the super admin signs in
e2e · acceptance › acceptance workflow > 2. connects an authorised Meta ad account (token validated, encrypted, never returned)
e2e · acceptance › acceptance workflow > 3. imports campaigns, ad sets, ads and performance automatically (cron)
e2e · acceptance › acceptance workflow > 4. the admin maps ads to creators
e2e · acceptance › acceptance workflow > 5–6. invites a content team member with selected creators and metrics
e2e · acceptance › acceptance workflow > 7. the member signs in and searches for an authorised creator
e2e · acceptance › acceptance workflow > 8. sees accurate, date-filtered performance for that creator
e2e · acceptance › acceptance workflow > 9. cannot reach other creators' data or restricted metrics by tampering with URLs or requests
e2e · acceptance › acceptance workflow > 10. shows the last successful synchronisation
e2e · acceptance › security controls > rejects unauthenticated API calls and redirects unauthenticated pages
e2e · acceptance › security controls > blocks cross-site state-changing requests
e2e · acceptance › security controls > validates input and returns safe errors
e2e · acceptance › security controls > sets security headers
e2e · acceptance › security controls > revoking access takes effect immediately
e2e · acceptance › security controls > rate-limits repeated sign-in attempts
e2e · acceptance › security controls > records sensitive actions in the audit log
e2e · acceptance › pages render for the admin > /overview
e2e · acceptance › pages render for the admin > /creators
e2e · acceptance › pages render for the admin > /creatives
e2e · acceptance › pages render for the admin > /creatives/mapping
e2e · acceptance › pages render for the admin > /campaigns
e2e · acceptance › pages render for the admin > /ad-accounts
e2e · acceptance › pages render for the admin > /reports
e2e · acceptance › pages render for the admin > /users
e2e · acceptance › pages render for the admin > /integrations
e2e · acceptance › pages render for the admin > /audit-logs
e2e · acceptance › pages render for the admin > /settings
e2e · acceptance › pages render for the admin > CSV export downloads for the admin
integration · sync-pipeline › Meta connection > rejects invalid tokens
integration · sync-pipeline › Meta connection > validates, encrypts and discovers ad accounts (sync off until enabled)
integration · sync-pipeline › scheduled sync > imports structure, creatives and daily insights end-to-end
integration · sync-pipeline › scheduled sync > sent every Graph API call with Bearer auth + appsecret_proof and never put the token in a URL
integration · sync-pipeline › scheduled sync > re-syncing the same window is idempotent
integration · sync-pipeline › scheduled sync > attribution updates revise rows and keep the previous values
integration · sync-pipeline › scheduled sync > reports reflect synchronised data
integration · sync-pipeline › failure handling > expired tokens fail the job, flag the connection and stop retries
integration · sync-pipeline › failure handling > rate limits pause the account and requeue without consuming an attempt
integration · sync-pipeline › failure handling > transient errors are retried transparently
integration · sync-pipeline › failure handling > drops fields Meta rejects and marks dependent metrics unsupported
integration · sync-pipeline › failure handling > splits large windows when Meta fails an async report
integration · sync-pipeline › failure handling > deduplicates queued work and recovers crashed workers
integration · admin › creator mapping > maps an unmapped ad, records history and audit, and keeps one creator per ad
integration · admin › creator mapping > enforces ad-account scope and asset ownership
integration · admin › creator mapping > naming rules map only unmapped ads, never override manual mappings, and skip ambiguity
integration · admin › users, invitations and privilege escalation > invites a user with selected creators and metrics; the token is single-use and stored hashed
integration · admin › users, invitations and privilege escalation > expired invitations are rejected
integration · admin › users, invitations and privilege escalation > non-super-admins cannot grant access they do not hold
integration · admin › users, invitations and privilege escalation > access changes apply immediately and are audited with before/after
integration · admin › users, invitations and privilege escalation > suspension revokes sessions immediately and protects the last super admin
integration · admin › exports > contains only permitted creators and metrics, respects filters, and is audited
integration · admin › exports > is refused without export permission
integration · reporting-scope › aggregation accuracy (super admin) > totals real accounts only and never mixes demo data
integration · reporting-scope › aggregation accuracy (super admin) > filters by date range inclusively
integration · reporting-scope › aggregation accuracy (super admin) > creator ranking credits each ad exactly once (no double counting)
integration · reporting-scope › aggregation accuracy (super admin) > creator page ROAS is computed from summed value ÷ summed spend
integration · reporting-scope › aggregation accuracy (super admin) > sorts and paginates creatives server-side
integration · reporting-scope › aggregation accuracy (super admin) > minimum spend/purchase thresholds exclude under-tested creatives
integration · reporting-scope › creator-level restrictions > content manager sees only their creator's data, even if the request asks for another creator
integration · reporting-scope › creator-level restrictions > cannot open another creator's page
integration · reporting-scope › creator-level restrictions > creator list and compare only include assigned creators
integration · reporting-scope › creator-level restrictions > strips restricted metrics from every response
integration · reporting-scope › creator-level restrictions > never sorts by a hidden metric
integration · reporting-scope › creator-level restrictions > creator viewer cannot access reports outside their permission
integration · reporting-scope › creator-level restrictions > ad-account scope limits a marketing manager to assigned accounts
integration · reporting-scope › creator-level restrictions > date permissions clamp the range server-side
integration · reporting-scope › creator-level restrictions > export permission is enforced
```

### Bugs the tests caught during development

* The creatives CSV export applied the leaderboard's minimum-spend threshold and silently dropped rows. Fixed: exports include every row unless a threshold is passed explicitly.
* A client component imported a module that transitively imported the database client. The production build failed. Fixed by moving client-safe constants out, and `db.ts` now imports `server-only` so this fails loudly in future.
