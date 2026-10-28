import Link from "next/link";
import { cn } from "@/lib/utils";

export function CreativesTabs({ active, canReport, canMap, query = "" }: { active: "leaderboard" | "compare" | "mapping"; canReport: boolean; canMap: boolean; query?: string }) {
  const tabs = [
    ...(canReport ? [{ key: "leaderboard", label: "Leaderboard", href: `/creatives${query}` }, { key: "compare", label: "Compare", href: `/creatives/compare${query}` }] : []),
    ...(canMap ? [{ key: "mapping", label: "Creator mapping", href: "/creatives/mapping" }] : []),
  ];
  return (
    <div className="flex gap-1 border-b px-4 sm:px-6 lg:px-8" role="tablist">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} role="tab" aria-selected={active === t.key} className={cn("-mb-px border-b-2 px-3 py-2.5 text-sm font-medium", active === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
