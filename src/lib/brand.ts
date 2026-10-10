// 站点品牌 — Naumi。NEXT_PUBLIC_* 在构建期内联，显式配置支持白标实例。
export const BRAND: string =
  (process.env.NEXT_PUBLIC_BRAND_NAME ?? "").trim() || "Naumi";

// 默认统一复用仓库中的 Naumi Logo；各位置可显式指定自己的资源。
export const BRAND_LOGO: string =
  (process.env.NEXT_PUBLIC_BRAND_LOGO ?? "").trim() || "/logo.png";
export const BRAND_CANVAS_LOGO: string =
  (process.env.NEXT_PUBLIC_BRAND_CANVAS_LOGO ?? "").trim() || BRAND_LOGO;
export const BRAND_LOGO_HAS_TEXT: boolean =
  (process.env.NEXT_PUBLIC_BRAND_LOGO_HAS_TEXT ?? "").trim() === "true";
export const BRAND_FAVICON: string =
  (process.env.NEXT_PUBLIC_BRAND_FAVICON ?? "").trim() || BRAND_LOGO;
export const BRAND_SQUARE_LOGO: string =
  (process.env.NEXT_PUBLIC_BRAND_SQUARE_LOGO ?? "").trim() || BRAND_FAVICON;
export const BRAND_EMAIL: string =
  (process.env.NEXT_PUBLIC_BRAND_EMAIL ?? "").trim() || "admin@naumi.local";

// 可选母站入口；未配置时不显示。
export const BRAND_PARENT_URL: string =
  (process.env.NEXT_PUBLIC_BRAND_PARENT_URL ?? "").trim();
export const BRAND_PARENT_LABEL: string =
  (process.env.NEXT_PUBLIC_BRAND_PARENT_LABEL ?? "").trim() || "返回主站";
