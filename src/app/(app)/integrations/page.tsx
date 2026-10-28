import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { pageAccess } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { env, metaAppConfigured } from "@/lib/env";
import { emailConfigured } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/metrics/format";
import { oauthRedirectUri } from "@/lib/meta/connection";
import type { SP } from "@/lib/url";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { ConnectTokenForm, ConnectionActions } from "@/components/admin/integrations";
import { SyncToggle } from "@/components/admin/account-actions";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <Integrations searchParams={searchParams} />
    </Suspense>
  );
}

function Check({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 text-red-500" />}
      <span>{label}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
    </li>
  );
}

async function Integrations({ searchParams }: { searchParams: Promise<SP> }) {
  await pageAccess("integrations.manage");
  const sp = await searchParams;
  const e = env();
  const [connections, accounts, settings] = await Promise.all([
    prisma.metaConnection.findMany({
      orderBy: { createdAt: "desc" },
      // Never select encryptedToken here.
      select: { id: true, label: true, authType: true, metaUserName: true, scopes: true, tokenExpiresAt: true, status: true, lastValidatedAt: true, lastError: true, isDemo: true, _count: { select: { adAccounts: true } } },
    }),
    prisma.adAccount.findMany({ orderBy: [{ isDemo: "asc" }, { name: "asc" }], select: { id: true, name: true, metaAccountId: true, currency: true, timezoneName: true, syncEnabled: true, isDemo: true, businessName: true, accountStatus: true, connection: { select: { label: true } } } }),
    getSettings(),
  ]);
  const configured = metaAppConfigured();

  return (
    <>
      <PageHeader title="Integrations" description="Connect Meta with credentials only admins control. Tokens are encrypted at rest (AES-256-GCM) and never sent to browsers." />
      <PageBody>
        {typeof sp.connected === "string" && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{sp.connected}</p>}
        {typeof sp.error === "string" && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{sp.error}</p>}
        {e.DEMO_MODE && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">DEMO_MODE is on: reports show only synthetic demo accounts. Real connections can still be set up here; set DEMO_MODE=false to report on them.</p>}

        <Section title="Readiness">
          <ul className="grid gap-3 md:grid-cols-2">
            <Check ok={configured} label="Meta app credentials" hint={configured ? `App ID ${e.META_APP_ID}` : "Set META_APP_ID and META_APP_SECRET in the server environment."} />
            <Check ok label={`Graph API version ${e.META_API_VERSION}`} hint="Change with META_API_VERSION after reviewing Meta's changelog." />
            <Check ok={emailConfigured()} label="Email delivery (invitations & password reset)" hint={emailConfigured() ? undefined : "SMTP not configured — invitation links are shown to the admin instead."} />
            <Check ok={connections.some((c) => !c.isDemo && c.status === "ACTIVE")} label="Active Meta connection" />
          </ul>
        </Section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Option A — System user token (recommended)" description="Create a system user in Meta Business Settings, assign it the ad accounts, and generate a token with ads_read (and business_management).">
            <ConnectTokenForm disabled={!configured} />
          </Section>
          <Section title="Option B — Facebook Login" description="An admin signs in with Facebook. Produces a long-lived (~60 day) user token that must be renewed before it expires.">
            <p className="mb-3 text-xs text-muted-foreground">Add this Valid OAuth Redirect URI in your Meta app: <code className="rounded bg-muted px-1 break-all">{oauthRedirectUri()}</code></p>
            {configured ? (
              <Button asChild variant="outline"><a href="/api/v1/admin/meta/oauth/start">Continue with Facebook</a></Button>
            ) : (
              <Button variant="outline" disabled>Continue with Facebook</Button>
            )}
          </Section>
        </div>

        <Section title="Connections" flush>
          {connections.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No Meta connections yet.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Connection</TableHead><TableHead>Status</TableHead><TableHead>Permissions</TableHead><TableHead>Token expiry</TableHead><TableHead>Accounts</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {connections.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell><p className="font-medium">{c.label}</p><p className="text-xs text-muted-foreground">{c.authType === "SYSTEM_USER_TOKEN" ? "System user token" : "Facebook Login"}{c.metaUserName ? ` · ${c.metaUserName}` : ""} · checked {formatDateTime(c.lastValidatedAt, settings.reportingTimezone)}</p>{c.lastError && <p className="max-w-md text-xs text-red-700">{c.lastError}</p>}</TableCell>
                      <TableCell className="text-xs font-medium">{c.status.toLowerCase()}</TableCell>
                      <TableCell className="text-xs">{c.scopes.join(", ") || "—"}</TableCell>
                      <TableCell className="text-xs">{c.isDemo ? "—" : c.tokenExpiresAt ? formatDateTime(c.tokenExpiresAt, settings.reportingTimezone) : "Does not expire"}</TableCell>
                      <TableCell className="text-xs">{c._count.adAccounts}</TableCell>
                      <TableCell><ConnectionActions id={c.id} isDemo={c.isDemo} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>

        <Section title="Ad accounts" description="Discovered accounts are not synced until you enable them. Enabling starts a historical import (up to Meta's 37-month retention)." actions={<Link className="text-xs font-medium text-primary hover:underline" href="/ad-accounts">Sync status →</Link>} flush>
          {accounts.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Connect Meta to discover ad accounts.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Ad account</TableHead><TableHead>Business</TableHead><TableHead>Currency / time zone</TableHead><TableHead>Sync</TableHead></TableRow></TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell><p className="font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.metaAccountId}{a.isDemo ? " · DEMO" : ""}{a.connection ? ` · ${a.connection.label}` : ""}</p></TableCell>
                      <TableCell className="text-sm">{a.businessName ?? "—"}</TableCell>
                      <TableCell className="text-sm">{a.currency} · {a.timezoneName}</TableCell>
                      <TableCell><SyncToggle id={a.id} enabled={a.syncEnabled} disabled={a.isDemo} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>
      </PageBody>
    </>
  );
}
