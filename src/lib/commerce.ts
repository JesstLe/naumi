import { enterpriseSiteIdentity } from '@/lib/site-control/identity';
import "server-only";

/**
 * 公开商业化总开关。
 * 内测阶段默认关闭：隐藏价格、充值、购买与公开销售页，并拒绝创建支付订单。
 * 正式开放时显式设置 NAUMI_PUBLIC_COMMERCE=1。
 */
export const publicCommerceEnabled =
  !enterpriseSiteIdentity() && (process.env.NAUMI_PUBLIC_COMMERCE || "").trim() === "1";

/** Internal image quality previews do not publish pricing reports. */
export const betaPreviewEnabled =
  (process.env.NAUMI_BETA_PREVIEW || "").trim() === "1";
/** Research quotes belong to administrators, not public sales navigation. */
export const pricingVisible = false;

/** 普通业务接口在额度不足时使用，避免内测阶段继续引导充值。 */
export const insufficientCreditsMessage = publicCommerceEnabled
  ? "积分不足，请充值后重试"
  : enterpriseSiteIdentity() ? "额度不足，请联系管理员" : "积分不足，请联系内测管理员补充额度";
