import { AlertTriangle } from "lucide-react";
import { ValidationError } from "@/lib/errors";

/** Render friendly messages for bad filter input instead of an error page. */
export async function withReportErrors<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, message: e.message };
    throw e;
  }
}

export function ReportErrorNotice({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">These filters can&apos;t be applied</p>
        <p>{message}</p>
      </div>
    </div>
  );
}
