import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { BillingManager } from "@/components/admin/billing/billing-manager";
export const dynamic = "force-dynamic";
export const metadata = { title: "计费管理 — Naumi", robots: { index: false, follow: false } };
export default async function BillingPage() { if (!await requireAdmin(new Request("http://internal/admin/billing", { headers: headers() })))
    notFound(); return <BillingManager />; }
