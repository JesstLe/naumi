import { PricingPage } from "@/components/pricing/pricing-page";
import { GENERATION_RESOLUTIONS } from "@/lib/mock-data";
import { BRAND } from "@/lib/brand";
import { notFound, redirect } from "next/navigation";
import { pricingVisible, publicCommerceEnabled } from "@/lib/commerce";

export const metadata = { title: `套餐与定价 — ${BRAND}`, description: "了解创作套餐、输出尺寸与开通说明。当前方案预览，暂未开放在线购买。" };

// Quote preview remains behind the current public pricing and commerce gates.
export default async function PlansPage() {
  if (!pricingVisible) notFound();
  if (!publicCommerceEnabled) redirect("/");
  return <PricingPage tiers={GENERATION_RESOLUTIONS.map(({ id, longSide }) => ({ id, longSide }))} />;
}
