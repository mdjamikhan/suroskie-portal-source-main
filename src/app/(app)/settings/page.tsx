import { Suspense } from "react";
import type { Metadata } from "next";
import { pageAccess } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Section } from "@/components/app/section";
import { ResetMetricButton, SettingsForm } from "@/components/admin/settings-form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await pageAccess("settings.manage");
  const [settings, metrics] = await Promise.all([getSettings(), prisma.metricDefinition.findMany({ orderBy: { sortOrder: "asc" } })]);
  return (
    <>
      <PageHeader title="Settings" description="Reporting, synchronisation and ranking defaults." />
      <PageBody>
        <Section title="Reporting & sync"><SettingsForm initial={settings} /></Section>
        <Section title="Metric catalogue" description="Definitions used throughout the portal. Metrics Meta rejects for the connected API version are marked unsupported and shown as unavailable — never as zero." flush>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Category</TableHead><TableHead>Definition</TableHead><TableHead>Sensitive</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {metrics.map((m) => (
                  <TableRow key={m.key}>
                    <TableCell className="font-medium whitespace-nowrap">{m.label}<code className="ml-2 text-[10px] text-muted-foreground">{m.key}</code></TableCell>
                    <TableCell className="text-xs">{m.category.toLowerCase()}</TableCell>
                    <TableCell className="max-w-xl text-xs text-muted-foreground">{m.description}{m.formula && <span className="mt-0.5 block font-mono">{m.formula}</span>}</TableCell>
                    <TableCell className="text-xs">{m.isSensitive ? "yes" : ""}</TableCell>
                    <TableCell className="text-xs">{m.isSupported ? <span className="text-emerald-700">supported</span> : <span className="text-red-700" title={m.unsupportedReason ?? ""}>unsupported <ResetMetricButton k={m.key} /></span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      </PageBody>
    </>
  );
}
