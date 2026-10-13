import { requireAdminPage } from "@/lib/admin-page";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { FeatureAccessManager } from "@/components/admin/feature-access-manager";
export const dynamic = "force-dynamic";
export default async function FeatureAccessPage() {
  await requireAdminPage("/admin/feature-access");
  return <AdminCenterShell active="feature-access" light><FeatureAccessManager /></AdminCenterShell>;
}
