// 站点品牌 — Naumi。NEXT_PUBLIC_* 在构建期内联，显式配置支持白标实例。
export const BRAND: string =
  (process.env.NEXT_PUBLIC_BRAND_NAME ?? "").trim() || "Naumi";

// 默认采用方案 A「胶囊 N」。透明黑标用于浅色 UI，黑底白标兼容明暗画布。
// 显式白标仍沿用原来的 Logo → favicon → square 回退顺序。
const customLogo = (process.env.NEXT_PUBLIC_BRAND_LOGO ?? "").trim();
export const BRAND_LOGO: string =
  customLogo || "/brand/naumi/symbol-black.svg";
export const BRAND_CANVAS_LOGO: string =
  (process.env.NEXT_PUBLIC_BRAND_CANVAS_LOGO ?? "").trim() || customLogo || "/brand/naumi/app-dark.svg";
export const BRAND_LOGO_HAS_TEXT: boolean =
  (process.env.NEXT_PUBLIC_BRAND_LOGO_HAS_TEXT ?? "").trim() === "true";
export const BRAND_FAVICON: string =
  (process.env.NEXT_PUBLIC_BRAND_FAVICON ?? "").trim() || customLogo || "/brand/naumi/app-dark.png";
export const BRAND_SQUARE_LOGO: string =
  (process.env.NEXT_PUBLIC_BRAND_SQUARE_LOGO ?? "").trim() || BRAND_FAVICON;
export const BRAND_EMAIL: string =
  (process.env.NEXT_PUBLIC_BRAND_EMAIL ?? "").trim() || "admin@naumi.local";

// 可选母站入口；未配置时不显示。
export const BRAND_PARENT_URL: string =
  (process.env.NEXT_PUBLIC_BRAND_PARENT_URL ?? "").trim();
export const BRAND_PARENT_LABEL: string =
  (process.env.NEXT_PUBLIC_BRAND_PARENT_LABEL ?? "").trim() || "返回主站";
