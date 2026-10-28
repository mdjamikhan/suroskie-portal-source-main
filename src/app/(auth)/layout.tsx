export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-sidebar-primary font-bold text-white">S</div>
          <span className="font-semibold text-white">Suroskie</span>
        </div>
        <div>
          <h2 className="text-3xl font-semibold leading-tight text-white">Creative Performance Portal</h2>
          <p className="mt-3 max-w-md text-sm text-sidebar-foreground/70">
            Creator and creative performance from Meta Ads, synced automatically. Every person sees only the creators and metrics they&apos;ve been given access to.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">Internal use only · Access by invitation</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
