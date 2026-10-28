import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton({ kpis = 4, table = true }: { kpis?: number; table?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="border-b bg-card px-4 py-5 sm:px-6 lg:px-8">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-80" />
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
        </div>
      </div>
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {kpis > 0 && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: kpis }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        )}
        <Skeleton className="h-72 rounded-xl" />
        {table && <Skeleton className="h-64 rounded-xl" />}
      </div>
    </div>
  );
}

export function SidebarSkeleton() {
  return <aside className="hidden h-screen w-64 shrink-0 bg-sidebar lg:block" />;
}
