import { requireAdminPage } from "@/lib/admin-page";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { ModelHealthPanel } from "@/components/admin/model-health/model-health";
import { ChannelCapacityPanel } from "@/components/admin/model-health/channel-capacity";
export const metadata = {
  title: "模型健康巡检 — Naumi",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function ModelHealthPage() {
  await requireAdminPage("/admin/model-health");
  return <AdminCenterShell active="model-health" light><ModelHealthPanel /><ChannelCapacityPanel /></AdminCenterShell>;
}
