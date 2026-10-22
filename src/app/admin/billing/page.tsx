import { ModelConfigurationManager } from "@/components/admin/model-config/manager";
import { requireAdminPage } from "@/lib/admin-page";
import { BillingManager } from "@/components/admin/billing/billing-manager";
import { AdminCenterShell } from "@/components/admin/center-shell";
export const dynamic = "force-dynamic";
export const metadata = { title: "计费管理 — Naumi", robots: { index: false, follow: false } };
export default async function BillingPage({ searchParams }: { searchParams?: Promise<{ section?: string; tab?: string }> }) {
  await requireAdminPage("/admin/billing");
  const query = await searchParams;
  const tabs = ['prices', 'costs', 'rules', 'products', 'credits', 'history', 'operations'] as const;
  type Tab = (typeof tabs)[number];
  const sections: Record<string, Tab> = { wallet: 'products', recharge: 'products', products: 'products', prices: 'prices', costs: 'costs', rules: 'rules', credits: 'credits', history: 'history', operations: 'operations' };
  const tab = query?.tab && tabs.includes(query.tab as Tab) ? query.tab as Tab : query?.section && Object.hasOwn(sections, query.section) ? sections[query.section] : undefined;
  const legacy = !!tab;
  const unknown = !!query?.section && !Object.hasOwn(sections, query.section) && !['config', 'models'].includes(query.section);
  return <AdminCenterShell active="billing">{unknown && <p role="status" className="mx-auto max-w-6xl px-6 pt-4 text-sm">旧分区“{query!.section!.slice(0, 80)}”没有对应内容，已打开模型与计费配置。</p>}{legacy ? <BillingManager initialTab={tab} /> : <ModelConfigurationManager billingMode />}</AdminCenterShell>;
}
