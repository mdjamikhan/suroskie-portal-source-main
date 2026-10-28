"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Building2, Clapperboard, FileBarChart, LayoutDashboard, LogOut, Megaphone, Menu, Plug, ScrollText, Settings, UserCog, Users, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth/auth-client";

const ICONS = { LayoutDashboard, Users, Clapperboard, Megaphone, Building2, FileBarChart, UserCog, Plug, ScrollText, Settings } as const;

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export function Sidebar({ items, user, demo }: { items: NavItem[]; user: { name: string; email: string; roles: string[] }; demo: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Main">
      {items.map((item) => {
        const Icon = ICONS[item.icon as keyof typeof ICONS] ?? LayoutDashboard;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className={cn("size-4", active ? "text-sidebar-primary" : "opacity-80")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-sidebar-border p-3">
      <div className="mb-2 px-2">
        <p className="truncate text-sm font-medium text-sidebar-accent-foreground">{user.name}</p>
        <p className="truncate text-xs text-sidebar-foreground/60">{user.email}</p>
        <p className="mt-1 truncate text-[11px] uppercase tracking-wide text-sidebar-foreground/50">{user.roles.join(" · ")}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          await authClient.signOut();
          window.location.href = "/login";
        }}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      >
        <LogOut className="size-4" /> Sign out
      </button>
    </div>
  );

  const brand = (
    <div className="flex h-16 items-center gap-2.5 px-6">
      <div className="grid size-8 place-items-center rounded-lg bg-sidebar-primary text-sm font-bold text-white">S</div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-white">Suroskie</p>
        <p className="text-[11px] text-sidebar-foreground/60">Creative Performance</p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar lg:flex">
        {brand}
        {demo && <DemoPill />}
        {nav}
        {footer}
      </aside>

      {/* Mobile / tablet */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-sidebar px-4 lg:hidden">
        <button type="button" aria-label="Open navigation" onClick={() => setOpen(true)} className="text-white">
          <Menu className="size-5" />
        </button>
        <span className="text-sm font-semibold text-white">Suroskie Creative Performance</span>
        {demo && <span className="ml-auto rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">DEMO</span>}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-sidebar">
            <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute top-5 right-4 text-white/80">
              <X className="size-5" />
            </button>
            {brand}
            {demo && <DemoPill />}
            {nav}
            {footer}
          </aside>
        </div>
      )}
    </>
  );
}

function DemoPill() {
  return (
    <div className="mx-4 mb-3 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] leading-snug text-amber-200">
      <strong className="font-semibold text-amber-300">DEMO MODE</strong> — synthetic data, not from Meta.
    </div>
  );
}
