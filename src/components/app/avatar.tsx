export function Avatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} referrerPolicy="no-referrer" />;
  }
  const initials = name.replace(/\(.*\)/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return <div className="grid shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground" style={{ width: size, height: size }}>{initials}</div>;
}
