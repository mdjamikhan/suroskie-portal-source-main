# Suroskie Creative Performance Portal

An internal web app that lets Suroskie's content team check how their creators' Meta ads perform, without asking the performance-marketing team for reports. Admins connect Meta ad accounts, map ads to creators, and decide exactly which creators, ad accounts, date ranges and metrics each person can see.

> **Status:** feature-complete for the acceptance workflow and covered by 130 automated tests (unit, database integration, and HTTP end-to-end against a production build). The Meta integration has been verified against a local mock of the Graph API only. It **has not yet been run against real Meta credentials**. See [docs/META_SETUP.md](docs/META_SETUP.md) and the [checklist](docs/CHECKLIST.md).

## What it does

| Area | Highlights |
|---|---|
| **Meta integration** | Official Graph/Marketing API (`v24.0` by default). Uses a system-user token or Facebook Login. Tokens are encrypted with AES-256-GCM and every call carries `appsecret_proof`. Daily insights come from async reports. Handles pagination, rate-limit headers, retries, expired tokens and rejected fields. |
| **Sync pipeline** | Postgres job queue with leases and dedupe. Recent days refresh on each scheduler run; the last 28 days are re-fetched daily for late attribution. Initial backfill goes up to 37 months. Upserts are idempotent and revisions are kept. Admins can trigger a manual sync. Each account shows its health and freshness. |
| **Creator mapping** | Each ad belongs to exactly one creator, so rankings never double count. Supports bulk assign and reassign, creative assets, naming-convention auto-mapping (never overrides manual mappings), a review queue for unmapped ads, and full change history. |
| **Reporting** | Overview, creator pages, creative leaderboard with sample-size thresholds, side-by-side compare, campaign/ad set/ad views, and age/gender/placement/device/geo breakdowns. Supports date presets and custom ranges in Asia/Kolkata, INR formatting, and period-over-period comparison. |
| **Accuracy** | Ratios are always recomputed from summed numerators and denominators. Overlapping purchase action types are de-duplicated. Each metric is explicitly in one of five states: `ok`, `not_applicable`, `unavailable`, `missing` or `0`. Summed reach is labelled as an upper bound. Mixed currencies are never added together. |
| **Access control** | Roles: Super Admin, Marketing Manager, Content Team Manager, Creator Viewer, plus custom roles. Per-user overrides cover permissions, metrics, ad accounts, creators, look-back window and earliest date. Enforcement happens in SQL and server-side projection, not the UI. |
| **Admin** | Invite-only users with single-use, 72-hour links. Suspend or revoke access instantly. Privilege-escalation guards, audit log, settings, and a metric catalogue. |
| **Exports** | CSV built from the same scoped services, so exports can't bypass permissions. Formula-injection safe and audited. |

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 + shadcn/ui (Radix) · Recharts · PostgreSQL + Prisma 7 · Better Auth · Vitest + Playwright-free HTTP e2e · GitHub Actions scheduled endpoints or a long-running Node worker.

## Quick start (local)

Prerequisites: Node 22+, PostgreSQL 14+ (with the `pg_trgm` extension available).

```bash
npm install
cp .env.example .env            # fill in DATABASE_URL and generate the secrets as described in the file
npx prisma migrate deploy       # create the schema
INITIAL_ADMIN_EMAIL=you@suroskie.com INITIAL_ADMIN_PASSWORD='a-long-passphrase' npm run db:seed
npm run dev                     # http://localhost:3000
```

To explore without Meta credentials, use synthetic demo data that is clearly labelled:

```bash
npm run demo:seed               # refuses if real ad accounts exist
DEMO_MODE=true npm run dev      # reports now show ONLY demo accounts, with a "DEMO" banner
npm run demo:clear              # remove all demo data
```

With `DEMO_MODE=false` (production), demo accounts are never shown. Real and demo data are never mixed in one report.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Seed permissions, metric catalogue and default roles (idempotent), and create the first Super Admin from env |
| `npm run worker` | Long-running sync worker for self-hosting (schedules hourly and drains the queue) |
| `npm run sync:once` | Schedule and process the queue once, then exit |
| `npm test` | All tests (unit, integration and e2e; e2e runs `next build`) |
| `npm run test:unit` / `test:integration` / `test:e2e` | Individual test suites |
| `npm run typecheck` / `lint` | TypeScript / ESLint |

## Documentation

* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): data model, permission model, sync pipeline, metric definitions
* [docs/META_SETUP.md](docs/META_SETUP.md): Meta app configuration, permissions, App Review and connecting real ad accounts
* [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md): adding users and assigning access, mapping creators to ads, everyday operations
* [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): production deployment (Vercel or self-hosted), security, backup and recovery
* [docs/TESTING.md](docs/TESTING.md): how to run the tests and the latest results
* [docs/CHECKLIST.md](docs/CHECKLIST.md): what is implemented, what is tested, what is pending, and known limitations

## Project layout

```
prisma/                  schema.prisma, migrations, seed.ts
src/app/(auth)/          login, password reset, invitation acceptance
src/app/(app)/           authenticated pages (overview, creators, creatives, campaigns, …)
src/app/api/v1/          JSON API (reports, exports, admin) — every route uses apiRoute()
src/app/api/cron/        scheduler + queue worker endpoints (CRON_SECRET)
src/lib/access/          permission catalogue, default roles, AccessContext resolution
src/lib/reporting/       scoped SQL, report services, exports, date ranges
src/lib/metrics/         metric catalogue, calculations, formatting (client-safe)
src/lib/meta/            Graph API client, errors, fields, parsing, OAuth/connection
src/lib/sync/            job queue, scheduler, structure sync, insight ingestion, worker
src/lib/mapping/         creator mapping + naming rules
src/lib/users/           invitations, access editing, roles
tests/                   unit, integration (Postgres), e2e (HTTP), mock Graph API
```
