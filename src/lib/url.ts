// Build URLs that change some search params while preserving the rest (used by server-rendered links).
export type SP = Record<string, string | string[] | undefined>;

export function hrefWith(path: string, sp: SP, patch: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") u.delete(k);
    else u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `${path}?${s}` : path;
}

/** Keep only the report filter params (for links between report pages). */
export function filterParams(sp: SP): SP {
  const keep = ["range", "from", "to", "account", "campaign", "product", "type", "compare"];
  return Object.fromEntries(Object.entries(sp).filter(([k]) => keep.includes(k)));
}
