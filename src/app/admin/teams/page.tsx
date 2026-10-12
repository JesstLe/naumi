import { requireAdminPage } from "@/lib/admin-page";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { TeamManager } from "@/components/team/team-manager";
export const dynamic = "force-dynamic";
export default async function AdminTeamsPage() {
  await requireAdminPage("/admin/teams");
  return <AdminCenterShell active="teams"><TeamManager admin /></AdminCenterShell>;
}
