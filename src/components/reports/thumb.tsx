import { Clapperboard, Image as ImageIcon, Layers } from "lucide-react";

export function Thumb({ url, type, size = 40 }: { url: string | null; type: string; size?: number }) {
  const Icon = type === "VIDEO" ? Clapperboard : type === "CAROUSEL" ? Layers : ImageIcon;
  if (url) {
    // Meta CDN thumbnail URL (signed, refreshed on every structure sync).
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" loading="lazy" className="shrink-0 rounded-md border bg-muted object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="grid shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground" style={{ width: size, height: size }} title={`${type.toLowerCase()} creative (no preview available)`}>
      <Icon className="size-4" />
    </div>
  );
}
