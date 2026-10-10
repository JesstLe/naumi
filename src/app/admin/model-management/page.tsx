import { requireAdminPage } from "@/lib/admin-page";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { ModelManagement } from "@/components/admin/model-management/model-management";
export const runtime = "nodejs", dynamic = "force-dynamic";
export const metadata = { title: "模型管理 — Naumi", robots: { index: false, follow: false } };
export default async function ModelManagementPage() {
  await requireAdminPage("/admin/model-management");
  return <AdminCenterShell active="model-management"><ModelManagement /></AdminCenterShell>;
}
