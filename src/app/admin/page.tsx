import { enterpriseSiteIdentity } from '@/lib/site-control/identity';
import { EnterpriseConsole } from '@/components/enterprise/enterprise-console';
import { Suspense } from "react";
import { AdminClient } from "@/components/admin/admin-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `管理中心 — ${BRAND}`, robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (enterpriseSiteIdentity()) {
    const params = await searchParams;
    const query = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    return <EnterpriseConsole initialQuery={query} identityAuthorityEnabled={process.env.NAUMI_IDENTITY_AUTHORITY_ENABLED === '1'} />;
  }
  return (
    <Suspense
      fallback={
        <div className="container py-20 text-sm text-muted-foreground">
          加载管理中心…
        </div>
      }
    >
      <AdminClient />
    </Suspense>
  );
}
