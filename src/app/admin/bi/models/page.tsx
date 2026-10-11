import { requireAdminPage } from "@/lib/admin-page";
import { ModelConfigurationManager } from "@/components/admin/model-config/manager";
import { AdminCenterShell } from "@/components/admin/center-shell";
export const metadata = {
  title: "模型配置中心 — Naumi",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function ModelsPage() {
  await requireAdminPage("/admin/bi/models");
  return <AdminCenterShell active="model-config"><ModelConfigurationManager /></AdminCenterShell>;
}
