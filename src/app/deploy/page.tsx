import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DeployCenter } from "@/components/operator/deploy-center";
import { BRAND } from "@/lib/brand";
import { localAdminOk } from "@/lib/admin-auth";

export const metadata = { title: `部署中心 — ${BRAND}` };
export const dynamic = "force-dynamic";

export default function DeployPage() {
  const cookie = headers().get("cookie") ?? "";
  if (!localAdminOk(new Request("http://local", { headers: { cookie } }))) redirect("/");
  return <DeployCenter />;
}
