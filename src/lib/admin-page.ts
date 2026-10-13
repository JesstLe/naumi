import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { adminPasswordState, requireAdmin } from "./admin-auth";
import { adminDestination } from "./admin-navigation";

export async function requireAdminPage(destination: string): Promise<void> {
  const request = new Request("http://internal" + adminDestination(destination), { headers: await headers() });
  if (await requireAdmin(request)) return;
  const access = await adminPasswordState(request);
  if (access.configured) redirect(`/admin?next=${encodeURIComponent(adminDestination(destination))}`);
  notFound();
}
