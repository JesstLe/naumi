import { redirect } from "next/navigation";
import { CardkeysAdmin } from "@/components/operator/cardkeys-admin";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `兑换码管理 — ${BRAND}` };
export const dynamic = "force-dynamic";

export default async function CardkeysPage() {

  return <CardkeysAdmin />;
}
