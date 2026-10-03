import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { BiDashboard } from "@/components/admin/bi/dashboard";
export const metadata = {
  title: "运营 BI — Naumi",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function BiPage() {
  if (
    !(await requireAdmin(
      new Request("http://internal/admin/bi", { headers: headers() }),
    ))
  )
    notFound();
  return <BiDashboard />;
}
