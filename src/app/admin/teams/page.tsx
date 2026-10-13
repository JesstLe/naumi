import { requireAdminPage } from "@/lib/admin-page";
import { AdminCenterShell } from "@/components/admin/center-shell";
import { TeamManager } from "@/components/team/team-manager";
export const dynamic = "force-dynamic";
export default async function AdminTeamsPage({ searchParams }: { searchParams: Promise<{ teamId?: string }> }) {
  await requireAdminPage("/admin/teams");
  const query = await searchParams;
  return <AdminCenterShell active="teams"><TeamManager admin initialTeamId={/^[a-f0-9-]{36}$/i.test(query.teamId || "") ? query.teamId : undefined} /></AdminCenterShell>;
}
