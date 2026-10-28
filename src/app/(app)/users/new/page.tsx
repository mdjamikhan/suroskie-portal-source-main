import { Suspense } from "react";
import type { Metadata } from "next";
import { pageAccess } from "@/lib/auth/session";
import { accessEditorData } from "@/lib/users/editor-data";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { AccessEditor } from "@/components/admin/access-editor";

export const metadata: Metadata = { title: "Invite user" };

export default function NewUserPage() {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} />}>
      <NewUser />
    </Suspense>
  );
}

async function NewUser() {
  const ctx = await pageAccess("users.manage");
  const data = await accessEditorData(ctx);
  const contentRole = data.roles.find((r) => r.key === "content_manager");
  return (
    <>
      <PageHeader title="Invite user" description="The user receives a single-use link (valid 72 hours) to set their password. Nobody can self-register." />
      <PageBody>
        <AccessEditor
          mode="invite"
          roles={data.roles}
          accounts={data.accounts}
          creators={data.creators}
          initial={{ roleIds: contentRole ? [contentRole.id] : [], adAccountIds: [], creatorIds: [], allAdAccounts: null, allCreators: null, maxLookbackDays: null, earliestDataDate: null, permissionOverrides: [], metricOverrides: [] }}
        />
      </PageBody>
    </>
  );
}
