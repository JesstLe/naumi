import Link from "next/link";
import { ModelConfigurationManager } from "@/components/admin/model-config/manager";
import { requireAdminPage } from "@/lib/admin-page";
import { BillingManager } from "@/components/admin/billing/billing-manager";
import { AdminCenterShell } from "@/components/admin/center-shell";
export const dynamic = "force-dynamic";
export const metadata = { title: "计费管理 — Naumi", robots: { index: false, follow: false } };
export default async function BillingPage({ searchParams }: { searchParams?: { section?: string } }) {
  await requireAdminPage("/admin/billing");
  const legacy = searchParams?.section === "wallet";
  return <AdminCenterShell active="billing"><nav className="mx-auto flex max-w-6xl gap-4 border-b border-c-border px-6 py-4 text-sm"><Link href="/admin/billing" className={!legacy ? "font-semibold underline underline-offset-8" : ""}>功能计费与模型路由</Link><Link href="/admin/billing?section=wallet" className={legacy ? "font-semibold underline underline-offset-8" : ""}>钱包、充值与兼容价格</Link></nav>{legacy ? <BillingManager /> : <ModelConfigurationManager billingMode />}</AdminCenterShell>;
}
