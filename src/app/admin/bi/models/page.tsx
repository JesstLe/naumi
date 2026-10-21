import { requireAdminPage } from "@/lib/admin-page";
import { ModelConfigurationManager } from "@/components/admin/model-config/manager";
import { AdminCenterShell } from "@/components/admin/center-shell";
export const metadata = {
  title: "模型配置中心 — Naumi",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function ModelsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  await requireAdminPage("/admin/bi/models");
  const query = await searchParams;
  return <AdminCenterShell active="model-config"><ModelConfigurationManager initialTab={query.tab === "batch" ? "batch" : undefined} /></AdminCenterShell>;
}
