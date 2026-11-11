import { requireAdminPage } from "@/lib/admin-page";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { ModelManagement } from "@/components/admin/model-management/model-management";
import { workspaceView } from "@/components/admin/model-management/workspace-navigation";
export const runtime = "nodejs", dynamic = "force-dynamic";
export const metadata = { title: "模型与供应商 — Naumi", robots: { index: false, follow: false } };
export default async function ModelManagementPage({searchParams}:{searchParams:Promise<{view?:string;model?:string}>}) {
  const query=await searchParams;
  await requireAdminPage("/admin/model-management");
  return <AdminCenterShell active="model-management" moduleNavigation={false}><ModelManagement initialView={workspaceView(query.view)} initialModel={query.model||null}/></AdminCenterShell>;
}
