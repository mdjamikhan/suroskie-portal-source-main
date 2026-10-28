// Meta connection management: token validation, encrypted storage, ad account discovery, OAuth.
import { prisma } from "@/lib/db";
import { env, metaAppConfigured } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { ValidationError } from "@/lib/errors";
import { MetaClient, type MetaClientOptions } from "./client";
import { MetaApiError } from "./errors";
import { AD_ACCOUNT_FIELDS } from "./fields";

/** Permissions the portal needs. ads_read covers campaigns/ads/insights; business_management lists business-owned accounts. */
export const REQUIRED_SCOPES = ["ads_read"];
export const OPTIONAL_SCOPES = ["business_management"];

export function clientForToken(accessToken: string, extra: Partial<MetaClientOptions> = {}): MetaClient {
  const e = env();
  return new MetaClient({
    accessToken,
    appSecret: e.META_APP_SECRET || undefined,
    version: e.META_API_VERSION,
    baseUrl: e.META_GRAPH_BASE_URL,
    ...extra,
  });
}

export async function clientForConnection(connectionId: string, extra: Partial<MetaClientOptions> = {}): Promise<MetaClient> {
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { id: connectionId }, select: { encryptedToken: true, status: true } });
  return clientForToken(decryptSecret(conn.encryptedToken), extra);
}

export interface TokenInfo {
  isValid: boolean;
  appId: string | null;
  type: string | null;
  userId: string | null;
  userName: string | null;
  scopes: string[];
  expiresAt: Date | null;
  dataAccessExpiresAt: Date | null;
}

/**
 * Validate a token with /debug_token (needs the app access token, i.e. META_APP_ID|META_APP_SECRET)
 * and /me. Rejects tokens issued for a different app and tokens without ads_read.
 */
export async function inspectToken(accessToken: string): Promise<TokenInfo> {
  const e = env();
  if (!metaAppConfigured()) throw new ValidationError("META_APP_ID and META_APP_SECRET must be configured before connecting Meta.");
  const appClient = new MetaClient({ accessToken: `${e.META_APP_ID}|${e.META_APP_SECRET}`, version: e.META_API_VERSION, baseUrl: e.META_GRAPH_BASE_URL, maxRetries: 2 });
  const debug = await appClient.get<{ data: { app_id?: string; type?: string; is_valid?: boolean; user_id?: string; scopes?: string[]; expires_at?: number; data_access_expires_at?: number } }>(
    "debug_token",
    { input_token: accessToken },
  );
  const d = debug.data ?? {};
  if (!d.is_valid) throw new ValidationError("Meta reports this access token is not valid.");
  if (d.app_id && d.app_id !== e.META_APP_ID) throw new ValidationError("This token was issued for a different Meta app.");
  const scopes = d.scopes ?? [];
  const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
  if (missing.length) throw new ValidationError(`The token is missing required permission(s): ${missing.join(", ")}.`);
  const me = await clientForToken(accessToken, { maxRetries: 2 }).get<{ id: string; name?: string }>("me", { fields: "id,name" });
  return {
    isValid: true,
    appId: d.app_id ?? null,
    type: d.type ?? null,
    userId: me.id ?? d.user_id ?? null,
    userName: me.name ?? null,
    scopes,
    // expires_at = 0 means the token does not expire (e.g. system user tokens).
    expiresAt: d.expires_at ? new Date(d.expires_at * 1000) : null,
    dataAccessExpiresAt: d.data_access_expires_at ? new Date(d.data_access_expires_at * 1000) : null,
  };
}

export async function createConnection(opts: { label: string; accessToken: string; authType: "SYSTEM_USER_TOKEN" | "OAUTH_USER_TOKEN"; createdById: string }) {
  const info = await inspectToken(opts.accessToken);
  return prisma.metaConnection.create({
    data: {
      label: opts.label,
      authType: opts.authType,
      encryptedToken: encryptSecret(opts.accessToken),
      metaUserId: info.userId,
      metaUserName: info.userName,
      scopes: info.scopes,
      tokenExpiresAt: info.expiresAt,
      dataAccessExpiresAt: info.dataAccessExpiresAt,
      status: "ACTIVE",
      lastValidatedAt: new Date(),
      createdById: opts.createdById,
    },
    select: { id: true, label: true, metaUserName: true, scopes: true, tokenExpiresAt: true },
  });
}

/** Re-check a stored connection and update its status. Never throws for token problems. */
export async function revalidateConnection(connectionId: string) {
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { id: connectionId } });
  try {
    const info = await inspectToken(decryptSecret(conn.encryptedToken));
    return prisma.metaConnection.update({
      where: { id: connectionId },
      data: { status: "ACTIVE", lastValidatedAt: new Date(), lastError: null, scopes: info.scopes, tokenExpiresAt: info.expiresAt, dataAccessExpiresAt: info.dataAccessExpiresAt },
    });
  } catch (e) {
    const msg = e instanceof MetaApiError ? e.describe() : (e as Error).message;
    const status = e instanceof MetaApiError && e.kind === "auth" ? "EXPIRED" : e instanceof ValidationError ? "INVALID" : "ERROR";
    return prisma.metaConnection.update({ where: { id: connectionId }, data: { status, lastError: msg.slice(0, 500), lastValidatedAt: new Date() } });
  }
}

export interface DiscoveredAccount {
  metaAccountId: string;
  name: string;
  currency: string;
  timezoneName: string;
  accountStatus: number | null;
  businessId: string | null;
  businessName: string | null;
}

/** List ad accounts the connected token can access and upsert them (sync disabled until an admin enables them). */
export async function discoverAdAccounts(connectionId: string): Promise<DiscoveredAccount[]> {
  const client = await clientForConnection(connectionId);
  const raw = await client.getAll<{ id: string; name: string; currency: string; timezone_name: string; account_status?: number; business?: { id: string; name: string } }>(
    "me/adaccounts",
    { fields: AD_ACCOUNT_FIELDS.join(","), limit: 100 },
  );
  const accounts = raw.map((a) => ({
    metaAccountId: a.id.startsWith("act_") ? a.id : `act_${a.id}`,
    name: a.name,
    currency: a.currency,
    timezoneName: a.timezone_name,
    accountStatus: a.account_status ?? null,
    businessId: a.business?.id ?? null,
    businessName: a.business?.name ?? null,
  }));
  for (const a of accounts) {
    await prisma.adAccount.upsert({
      where: { metaAccountId: a.metaAccountId },
      create: { ...a, connectionId, isDemo: false, syncEnabled: false },
      update: { name: a.name, currency: a.currency, timezoneName: a.timezoneName, accountStatus: a.accountStatus, businessId: a.businessId, businessName: a.businessName, connectionId },
    });
  }
  await prisma.metaConnection.update({ where: { id: connectionId }, data: { lastValidatedAt: new Date(), status: "ACTIVE", lastError: null } });
  return accounts;
}

// ───────────── OAuth (Facebook Login / Facebook Login for Business) ─────────────

export function oauthRedirectUri(): string {
  return `${env().APP_URL}/api/v1/admin/meta/oauth/callback`;
}

export function oauthDialogUrl(state: string, configId?: string): string {
  const e = env();
  const u = new URL(`${e.META_OAUTH_BASE_URL}/${e.META_API_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", e.META_APP_ID);
  u.searchParams.set("redirect_uri", oauthRedirectUri());
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  // Facebook Login for Business uses a configuration id instead of a scope list.
  if (configId) u.searchParams.set("config_id", configId);
  else u.searchParams.set("scope", [...REQUIRED_SCOPES, ...OPTIONAL_SCOPES].join(","));
  return u.toString();
}

/** Exchange an OAuth code for a long-lived (≈60 day) user access token. */
export async function exchangeOAuthCode(code: string): Promise<string> {
  const e = env();
  const appClient = new MetaClient({ accessToken: `${e.META_APP_ID}|${e.META_APP_SECRET}`, version: e.META_API_VERSION, baseUrl: e.META_GRAPH_BASE_URL, maxRetries: 2 });
  const short = await appClient.get<{ access_token: string }>("oauth/access_token", {
    client_id: e.META_APP_ID, client_secret: e.META_APP_SECRET, redirect_uri: oauthRedirectUri(), code,
  });
  const long = await appClient.get<{ access_token: string }>("oauth/access_token", {
    grant_type: "fb_exchange_token", client_id: e.META_APP_ID, client_secret: e.META_APP_SECRET, fb_exchange_token: short.access_token,
  });
  return long.access_token;
}
