"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <AlertTriangle className="mx-auto size-10 text-amber-500" />
      <h1 className="mt-4 text-lg font-semibold">This page couldn&apos;t be loaded</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Something went wrong while loading the report. No data was changed. Try again, or contact an administrator if it keeps happening.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </div>
  );
}
