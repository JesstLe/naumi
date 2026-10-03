import "server-only";

/**
 * 公开商业化总开关。
 * 内测阶段默认关闭：隐藏价格、充值、购买与公开销售页，并拒绝创建支付订单。
 * 正式开放时显式设置 NAUMI_PUBLIC_COMMERCE=1。
 */
export const publicCommerceEnabled =
  (process.env.NAUMI_PUBLIC_COMMERCE || "").trim() === "1";

/** Internal testers can review pricing without enabling payment transactions. */
export const betaPreviewEnabled =
  (process.env.NAUMI_BETA_PREVIEW || "").trim() === "1";
export const pricingVisible = publicCommerceEnabled || betaPreviewEnabled;

/** 普通业务接口在额度不足时使用，避免内测阶段继续引导充值。 */
export const insufficientCreditsMessage = publicCommerceEnabled
  ? "积分不足，请充值后重试"
  : "积分不足，请联系内测管理员补充额度";
