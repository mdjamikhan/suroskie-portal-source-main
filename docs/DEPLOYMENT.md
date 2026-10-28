# Production deployment

## Option 1: Vercel + managed Postgres (recommended)

1. **Database.** Create a managed PostgreSQL 14+ database (Neon, Supabase, RDS, Cloud SQL, Vercel Postgres, …).
   * Enable SSL (`?sslmode=require`) and automated backups with point-in-time recovery.
   * Make sure the `pg_trgm` extension is allowed. Most providers allow it; the first migration runs `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
   * Create a dedicated database user that owns only this database.
2. **Project.** Import the repository into Vercel (framework: Next.js). The build command `npm run build` runs `prisma generate` and `next build`.
3. **Environment variables** (Project → Settings → Environment Variables, *Production*). Use `.env.example` as the reference.
   * `DATABASE_URL`, `APP_URL` and `BETTER_AUTH_URL`: your production URL, e.g. `https://reports.suroskie.com`.
   * `BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` and `CRON_SECRET`: generate fresh values; never reuse development ones.
   * `META_APP_ID`, `META_APP_SECRET` and `META_API_VERSION`.
   * `SMTP_*` and `EMAIL_FROM`: needed for invitations and password resets.
   * `DEMO_MODE=false`.
4. **Migrations and first admin.** Run once from a trusted machine or CI with the production `DATABASE_URL`:
   ```bash
   npx prisma migrate deploy
   INITIAL_ADMIN_EMAIL=… INITIAL_ADMIN_PASSWORD='…' npm run db:seed
   ```
   Re-running `db:seed` is safe: it refreshes reference data and never overwrites role edits.
5. **Scheduled sync (free alternative to Vercel Cron).** The repository workflow at `.github/workflows/sync-cron.yml` calls `/api/cron/sync` daily at 00:07 UTC (05:37 IST) and `/api/cron/worker` every 5 minutes. `vercel.json` intentionally contains no cron declarations because Vercel Hobby supports only daily crons.
   * In GitHub repository **Settings → Secrets and variables → Actions**, add `APP_URL` (the production base URL, without a trailing slash) and `CRON_SECRET`.
   * Set the same high-entropy `CRON_SECRET` value in the Vercel Production environment variables. The workflow sends it in the authenticated request header; do not put the value in workflow source.
   * Enable GitHub Actions and push the workflow to the repository's default branch. Scheduled workflows run from that branch; GitHub may delay scheduled starts, and scheduled runs can be paused for inactive repositories.
   * GitHub Actions is free within the applicable included usage. Public repositories get free standard-runner usage; private repositories are subject to the account's monthly included minutes, so the five-minute worker may exceed a small quota. Check **Billing and plans → Actions** usage; this workflow does not guarantee unlimited free runner minutes.
   * Requests retry transient failures and time out, with separate concurrency groups for the two schedules. The Postgres job queue deduplicates scheduled jobs and locks job claims. Each endpoint processes work for up to `WORKER_TIME_BUDGET_MS` (capped at 270 s; Vercel `maxDuration` is 300 s).
6. **Domain.** Add the custom domain and keep HTTPS only. Cookies become `Secure` automatically when `APP_URL` is HTTPS.
7. Follow [META_SETUP.md](META_SETUP.md) to connect Meta, then run its "First live run" checklist.

## Option 2: Self-hosted (Docker / Railway / Render / Fly / VM)

```bash
docker build -t suroskie-portal .
docker run --env-file .env -p 3000:3000 suroskie-portal          # web (runs migrate deploy on start)
docker run --env-file .env suroskie-portal npm run worker         # sync worker (separate process)
```

* Run **one** web service (scale horizontally if needed) and **one** worker process. Several workers are safe because job claiming uses `SKIP LOCKED` and allows one running job per account, but one is enough.
* With the long-running worker you don't need the cron endpoints. Alternatively, keep the web app only and call the cron endpoints from any scheduler using the shared `CRON_SECRET` authorization header.
* Put a TLS-terminating reverse proxy in front. It must forward `X-Forwarded-For`, which rate limiting and the audit log use.

## Security checklist

- [ ] Unique, high-entropy `BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` and `CRON_SECRET` stored only in the host's secret manager
- [ ] `TOKEN_ENCRYPTION_KEY` backed up separately from database backups (without it, stored Meta tokens are unreadable; with it plus a DB dump, they're readable)
- [ ] `INITIAL_ADMIN_*` removed from the environment after first seed; the bootstrap admin password changed through **Forgot password**
- [ ] **Require app secret** enabled in the Meta app
- [ ] Database reachable only from the app (private networking or IP allow-list), with SSL required
- [ ] SMTP configured, so password resets work
- [ ] `DEMO_MODE=false`
- [ ] Least privilege: give most people **Content Team Manager** or **Creator Viewer**, and keep Super Admins to two or three people
- [ ] Review the **Audit logs** periodically, especially `export.csv`, `user.access_updated` and `meta.*`

Built-in protections:

* Server-side authorization on every request.
* Parameterised SQL only.
* zod validation on every input.
* Hashed passwords (scrypt, via Better Auth).
* `httpOnly` / `SameSite=Lax` / `Secure` cookies.
* CSRF origin checks.
* Rate limits backed by Postgres.
* Security headers: CSP, `X-Frame-Options: DENY`, HSTS in production, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
* No `X-Powered-By`.
* Generic error messages (details are logged server-side only).
* CSV formula-injection protection.
* Meta tokens are encrypted at rest and never selected into any API response.

## Backup and recovery

| What | How |
|---|---|
| Database | Provider-managed daily backups plus point-in-time recovery (7–30 days). For an extra copy: `pg_dump --format=custom "$DATABASE_URL" > suroskie-$(date +%F).dump`. |
| Secrets | Store `TOKEN_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET` and `CRON_SECRET` in a password manager or vault, separate from DB backups. |
| Restore | `pg_restore --clean --if-exists -d "$DATABASE_URL" suroskie-YYYY-MM-DD.dump`, then `npx prisma migrate deploy`. |
| Lost Meta data | Daily insights can always be re-imported from Meta within its retention (37 months). Use **Ad accounts → Resync range…**. Mapping, users, settings and audit history exist only in the database, so back it up. |
| Lost `TOKEN_ENCRYPTION_KEY` | Set a new key and reconnect Meta on the Integrations page. Everything else keeps working. |

**Data retention** (automatic, daily, `runRetention()`):

| Data | Kept for |
|---|---|
| Finished sync jobs | 90 days |
| Job events | 30 days |
| Insight revision history | 400 days |
| Breakdown rows | `breakdownDays` + 60 days |
| Rate-limit and verification rows | 1 day |

Daily insights, mappings and audit logs are **kept indefinitely**. Prune the audit log yourself if your policy requires it.

## Operations

* **Health.** The Ad accounts page shows per-account sync health, and report headers show freshness. Consider an external uptime check on `/login` and an alert when `/api/cron/sync` returns a non-200 status.
* **Upgrading the Meta API version.** Change `META_API_VERSION`, deploy, trigger **Sync now** on one account, then check **Settings → Metric catalogue** for metrics marked unsupported.
* **Logs.** Unhandled errors are logged as `[api] unhandled error`, sync failures as `[sync] job … failed`, and Meta trace IDs (`fbtrace_id`) are included in job error messages for Meta support.
