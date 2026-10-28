/* eslint-disable @typescript-eslint/no-explicit-any -- loosely-typed JSON test client */
// Minimal cookie-aware HTTP client for e2e tests.
export const BASE = "http://localhost:3100";
let ipSeq = 1;

export class Session {
  cookies = new Map<string, string>();
  ip = `10.0.0.${ipSeq++}`;

  private cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async req(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; redirect?: RequestRedirect } = {}) {
    const method = init.method ?? (init.body !== undefined ? "POST" : "GET");
    const res = await fetch(BASE + path, {
      method,
      redirect: init.redirect ?? "manual",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" ? { Origin: BASE } : {}),
        "x-forwarded-for": this.ip,
        Cookie: this.cookieHeader(),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (/Max-Age=0/i.test(c) || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }

  async json<T = any>(path: string, init?: Parameters<Session["req"]>[1]): Promise<{ status: number; body: T }> {
    const r = await this.req(path, init);
    const text = await r.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {}
    return { status: r.status, body };
  }

  async signIn(email: string, password: string) {
    return this.json("/api/auth/sign-in/email", { method: "POST", body: { email, password } });
  }
}
