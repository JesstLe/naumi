import { requireAdminPage } from "@/lib/admin-page";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { ModelMvp } from "@/components/admin/mvp/model-mvp";
export const runtime = "nodejs", dynamic = "force-dynamic";
export const metadata = { title: "模型连接 · MVP — Naumi", robots: { index: false, follow: false } };
export default async function MvpPage() {
  await requireAdminPage("/admin/mvp");
  return <AdminCenterShell active="mvp"><ModelMvp /></AdminCenterShell>;
}
