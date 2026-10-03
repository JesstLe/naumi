import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { ModelConfigurationManager } from "@/components/admin/model-config/manager";
export const metadata = {
  title: "模型配置中心 — Naumi",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function ModelsPage() {
  if (
    !(await requireAdmin(
      new Request("http://internal/admin/bi/models", { headers: headers() }),
    ))
  )
    notFound();
  return <ModelConfigurationManager />;
}
