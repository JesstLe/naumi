import { requireAdminPage } from "@/lib/admin-page";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { TeamAccessManager } from "@/components/team/team-access-manager";
export const dynamic="force-dynamic";
export default async function TeamAccessPage(){
 await requireAdminPage("/admin/team-access");
 return <AdminCenterShell active="team-access"><TeamAccessManager /></AdminCenterShell>;
}
