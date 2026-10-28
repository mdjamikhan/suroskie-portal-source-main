import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="border-b bg-card">
      <div className="flex flex-col gap-3 px-4 py-5 sm:px-6 lg:px-8 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="px-4 pb-4 sm:px-6 lg:px-8">{children}</div>}
    </div>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="min-w-0 space-y-6 px-4 py-6 sm:px-6 lg:px-8">{children}</div>;
}
