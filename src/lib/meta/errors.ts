// Classification of Graph API errors, based on Meta's documented error codes:
// https://developers.facebook.com/docs/graph-api/guides/error-handling
// https://developers.facebook.com/docs/marketing-api/overview/rate-limiting

export type MetaErrorKind =
  | "auth" // token invalid/expired/revoked → needs admin reconnection; do not retry
  | "permission" // token lacks permission for the object → do not retry
  | "rate_limit" // throttled → retry after a delay without counting as a failure
  | "transient" // temporary Meta-side problem → retry with backoff
  | "invalid_request" // bad parameter/field → fix and retry, or fail
  | "unknown";

export interface MetaErrorBody {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  is_transient?: boolean;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 341]);
const AUTH_CODES = new Set([102, 190]);

export function classifyMetaError(httpStatus: number, body: MetaErrorBody | undefined): MetaErrorKind {
  const code = body?.code;
  if (code !== undefined) {
    if (AUTH_CODES.has(code)) return "auth";
    if (RATE_LIMIT_CODES.has(code) || (code >= 80000 && code <= 80014)) return "rate_limit";
    if (code === 10 || (code >= 200 && code <= 299) || code === 3) return "permission";
    if (body?.is_transient || code === 1 || code === 2) return "transient";
    if (code === 100) return "invalid_request";
  }
  if (httpStatus === 429) return "rate_limit";
  if (httpStatus >= 500) return "transient";
  if (httpStatus === 401) return "auth";
  if (httpStatus === 403) return "permission";
  return "unknown";
}

export class MetaApiError extends Error {
  readonly kind: MetaErrorKind;
  readonly httpStatus: number;
  readonly code?: number;
  readonly subcode?: number;
  readonly fbtraceId?: string;
  /** Suggested wait before retrying (rate limits), in ms. */
  readonly retryAfterMs?: number;

  constructor(opts: { httpStatus: number; body?: MetaErrorBody; retryAfterMs?: number; message?: string; kind?: MetaErrorKind }) {
    const b = opts.body;
    super(opts.message ?? b?.error_user_msg ?? b?.message ?? `Meta API request failed (HTTP ${opts.httpStatus})`);
    this.name = "MetaApiError";
    this.httpStatus = opts.httpStatus;
    this.code = b?.code;
    this.subcode = b?.error_subcode;
    this.fbtraceId = b?.fbtrace_id;
    this.kind = opts.kind ?? classifyMetaError(opts.httpStatus, b);
    this.retryAfterMs = opts.retryAfterMs;
  }

  get retryable(): boolean {
    return this.kind === "rate_limit" || this.kind === "transient" || this.kind === "unknown";
  }

  /** Short, secret-free description for logs and the admin UI. */
  describe(): string {
    const parts = [`${this.kind}`, this.code !== undefined ? `code ${this.code}` : null, this.subcode ? `subcode ${this.subcode}` : null, this.fbtraceId ? `trace ${this.fbtraceId}` : null].filter(Boolean);
    return `${this.message} (${parts.join(", ")})`;
  }
}

/** If Meta rejected a specific field (code 100), return its name so callers can drop it and retry. */
export function rejectedField(err: MetaApiError, requested: string[]): string | null {
  if (err.code !== 100) return null;
  const msg = err.message;
  for (const f of requested) {
    const base = f.split("{")[0];
    if (new RegExp(`\\b${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(msg) && /field|param|nonexisting|invalid/i.test(msg)) return f;
  }
  return null;
}
