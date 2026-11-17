import { ModelConfigurationManager } from "@/components/admin/model-config/manager";
import { requireAdminPage } from "@/lib/admin-page";
import { BillingManager } from "@/components/admin/billing/billing-manager";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { legacyBillingSection, resolveLegacyBillingTab } from "@/components/admin/billing/legacy-tabs";
export const dynamic = "force-dynamic";
export const metadata = { title: "计费管理 — Naumi", robots: { index: false, follow: false } };
export default async function BillingPage({ searchParams }: { searchParams?: Promise<{ section?: string; tab?: string }> }) {
  await requireAdminPage("/admin/billing");
  const query = await searchParams;
  const tab = resolveLegacyBillingTab(query?.tab, query?.section);
  const legacy = !!tab;
  const unknown = !!query?.section && !legacyBillingSection(query.section) && !['config', 'models'].includes(query.section);
  return <AdminCenterShell active="billing">{unknown && <p role="status" className="mx-auto max-w-6xl px-6 pt-4 text-sm">旧分区“{query!.section!.slice(0, 80)}”没有对应内容，已打开模型与计费配置。</p>}{legacy ? <BillingManager initialTab={tab} /> : <ModelConfigurationManager billingMode />}</AdminCenterShell>;
}
