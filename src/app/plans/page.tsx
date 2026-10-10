import { PricingPage } from "@/components/pricing/pricing-page";
import { GENERATION_RESOLUTIONS } from "@/lib/mock-data";
import { BRAND } from "@/lib/brand";
import { notFound, redirect } from "next/navigation";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { editionName } from "@/lib/edition";
import { getSitePage } from "@/lib/settings";
import { CustomPage } from "@/components/custom-page";
import { pricingVisible, publicCommerceEnabled } from "@/lib/commerce";

export const metadata = { title: `套餐与定价 — ${BRAND}`, description: "了解创作套餐、输出尺寸与开通说明。当前方案预览，暂未开放在线购买。" };

// 官方云:展示独立的报价预览，不连接现有充值或支付接口。
// 自部署实例:渲染站长后台自定义的「定价」页(单用户无计费,内容由站长自定)。
export default async function PlansPage() {
  if (!pricingVisible) notFound();
  if (!publicCommerceEnabled) redirect("/");
  if (editionName !== "cloud") {
    const locale = getServerLocale();
    const custom = await getSitePage("plans");
    return (
      <CustomPage
        title={locale === "en" ? "Pricing" : "定价"}
        content={
          custom ||
          (locale === "en" ? "Content coming soon." : "内容建设中，敬请期待。")
        }
      />
    );
  }
  return <PricingPage tiers={GENERATION_RESOLUTIONS.map(({ id, longSide }) => ({ id, longSide }))} />;
}
