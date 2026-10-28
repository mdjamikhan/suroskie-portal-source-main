// Asynchronous Insights reports (POST /act_<id>/insights → poll /<report_run_id> → read results).
// Async reports are Meta's recommended path for large, ad-level, daily-increment requests.
import type { MetaClient, Params } from "./client";
import { MetaApiError, rejectedField } from "./errors";

export interface InsightsRequest {
  accountId: string; // act_<id>
  since: string;
  until: string;
  fields: string[];
  breakdowns?: readonly string[];
}

export function insightsParams(req: InsightsRequest): Params {
  return {
    level: "ad",
    time_increment: 1,
    time_range: { since: req.since, until: req.until },
    fields: req.fields.join(","),
    // Report each ad set's own attribution setting, matching Ads Manager.
    use_unified_attribution_setting: true,
    breakdowns: req.breakdowns?.length ? req.breakdowns.join(",") : undefined,
    limit: 500,
  };
}

export type ReportStatus = "pending" | "completed" | "failed";

export async function startReport(client: MetaClient, req: InsightsRequest): Promise<string> {
  const res = await client.post<{ report_run_id?: string }>(`${req.accountId}/insights`, insightsParams(req));
  if (!res.report_run_id) throw new MetaApiError({ httpStatus: 200, kind: "transient", message: "Meta did not return a report_run_id" });
  return res.report_run_id;
}

export async function reportStatus(client: MetaClient, reportRunId: string): Promise<{ status: ReportStatus; percent: number; raw: string }> {
  const r = await client.get<{ async_status?: string; async_percent_completion?: number }>(reportRunId, { fields: "async_status,async_percent_completion" });
  const raw = r.async_status ?? "unknown";
  const status: ReportStatus = raw === "Job Completed" ? "completed" : raw === "Job Failed" || raw === "Job Skipped" ? "failed" : "pending";
  return { status, percent: r.async_percent_completion ?? 0, raw };
}

export async function* reportResults<T>(client: MetaClient, reportRunId: string): AsyncGenerator<T[]> {
  yield* client.paginate<T>(`${reportRunId}/insights`, { limit: 500 });
}

/**
 * Start a report, dropping any fields Meta rejects (reported back so dependent metrics can be
 * marked unsupported).
 */
export async function startReportWithFieldFallback(
  client: MetaClient,
  req: InsightsRequest,
): Promise<{ reportRunId: string; droppedFields: string[]; fields: string[] }> {
  let fields = [...req.fields];
  const dropped: string[] = [];
  for (let i = 0; i < 8; i++) {
    try {
      const reportRunId = await startReport(client, { ...req, fields });
      return { reportRunId, droppedFields: dropped, fields };
    } catch (e) {
      if (!(e instanceof MetaApiError)) throw e;
      const bad = rejectedField(e, fields);
      if (!bad || ["ad_id", "date_start", "spend", "impressions"].includes(bad)) throw e;
      fields = fields.filter((f) => f !== bad);
      dropped.push(bad);
    }
  }
  throw new MetaApiError({ httpStatus: 400, kind: "invalid_request", message: "Too many rejected insight fields" });
}
