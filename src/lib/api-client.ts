"use client";

/** fetch wrapper for the portal's JSON API: throws an Error with the server's safe message. */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const details = json?.error?.details;
    const detail = Array.isArray(details) && details[0] ? (typeof details[0] === "string" ? details[0] : `${details[0].path ? details[0].path + ": " : ""}${details[0].message}`) : null;
    throw new Error(detail ? `${json.error.message}: ${detail}` : json?.error?.message ?? `Request failed (${res.status})`);
  }
  return json as T;
}
