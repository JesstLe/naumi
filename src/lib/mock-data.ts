// All data here is MOCK. Swap for Supabase/Postgres + OpenAI Image API later.
import { IMAGES, img } from "@/lib/images";

export type Category =
  | "main"
  | "banner"
  | "scene"
  | "xiaohongshu"
  | "detail"
  | "cutout" // AI 抠图(透明底)产物,作品页单独筛选、不混进成片
  | "fusion" // AI 融图(多图合成)产物,作品页单独筛选、不混进成片
  | "variation" // AI 图裂变(单图出多变体)产物,作品页单独筛选
  | "upscale" // AI 变清晰(超分放大)产物,作品页单独筛选
  | "inpaint" // 局部改图(涂抹重绘)产物,作品页单独筛选
  | "print" // 印花提取(提取图案)产物,作品页单独筛选
  | "avatar" // 抠头像(头部大头贴)产物,作品页单独筛选
  | "style" // 风格转换产物,作品页单独筛选
  | "garment" // 服装提取(平铺产品图)产物,作品页单独筛选
  | "printfile" // 印刷图(高清印刷文件)产物,作品页单独筛选
  | "tryon" // 服装上身(虚拟试穿)产物,作品页单独筛选
  | "dress3d" // 3D 服装图(立体产品图)产物,作品页单独筛选
  | "packaging3d" // 模切线图折叠生成的包装 3D 产品可视化
  | "dewrinkle" // 服装去皱产物,作品页单独筛选
  | "dewatermark" // 去水印产物,作品页单独筛选
  | "audio" // 视频拆分出的音轨节点
  | "video"
  | "media"; // 清单、分片、字幕和原生媒体处理辅助产物

export const CATEGORY_LABELS: Record<Category, string> = {
  main: "电商主图",
  banner: "Banner 横幅",
  scene: "商品场景图",
  xiaohongshu: "小红书封面",
  detail: "详情页首屏",
  cutout: "抠图",
  fusion: "融图",
  variation: "图裂变",
  upscale: "变清晰",
  inpaint: "局部改图",
  print: "印花提取",
  avatar: "抠头像",
  style: "风格转换",
  garment: "服装提取",
  printfile: "印刷图",
  tryon: "服装上身",
  dress3d: "3D 服装图",
  packaging3d: "包装 3D 可视化",
  dewrinkle: "服装去皱",
  dewatermark: "去水印",
  audio: "视频音轨",
  video: "视频",
  media: "媒体文件",
};

export type PromptTemplate = {
  id: string;
  title: string;
  // 兼容 canghe 导入：可为我方 Category 中文标签，或其原始分类（如 摄影与写实）
  category: string;
  industry: string;
  description: string;
  prompt: string;
  tags: string[];
  image: string;
  gradient: string;
  popular?: boolean;
  // 管理员手动「上首页」开关:true=强制加入首页 hero/showcase 轮换池
  homepageFeatured?: boolean;
  // 白底原图:作品转模板时带进来的原作品上传图,做同款时载入产品图(库模板为空)
  sourceImage?: string;
};

export type Showcase = {
  id: string;
  industry: string;
  title: string;
  metric: string;
  image: string;
  gradient: string;
};

export const SHOWCASES: Showcase[] = [
  {
    id: "sc-skincare",
    industry: "护肤美妆",
    title: "精华液白底主图升级",
    metric: "点击率 +38%",
    image: img(IMAGES.skincare[1]),
    gradient: "from-rose-100 to-slate-100",
  },
  {
    id: "sc-fashion",
    industry: "女装服饰",
    title: "连衣裙街拍场景图",
    metric: "转化率 +27%",
    image: img(IMAGES.fashion[2]),
    gradient: "from-emerald-100 to-lime-100",
  },
  {
    id: "sc-food",
    industry: "食品生鲜",
    title: "零食诱人特写主图",
    metric: "加购率 +45%",
    image: img(IMAGES.food[2]),
    gradient: "from-amber-100 to-orange-100",
  },
  {
    id: "sc-home",
    industry: "家居家纺",
    title: "四件套北欧场景图",
    metric: "停留时长 +1.9x",
    image: img(IMAGES.home[2]),
    gradient: "from-stone-100 to-amber-100",
  },
  {
    id: "sc-digital",
    industry: "3C 数码",
    title: "耳机科技感主图",
    metric: "点击率 +52%",
    image: img(IMAGES.digital[1]),
    gradient: "from-sky-100 to-teal-100",
  },
];

export type PlanKey = "starter" | "pro" | "studio" | "team";

export type PricingPlan = {
  id: PlanKey;
  name: string;
  price: string;
  priceValue: number;
  period: string;
  tagline: string;
  credits: string;
  monthlyCredits: number;
  features: string[];
  cta: string;
  highlighted?: boolean;
};

// 一键套图目标平台(前端选择器用;各平台风格提示词在 prompt-config 的 SUITE_PLATFORM_HINTS,后台可改)。
export const SUITE_PLATFORMS = [
  { id: "taobao", label: "淘宝 / 天猫" },
  { id: "douyin", label: "抖音 / 抖店" },
  { id: "pdd", label: "拼多多" },
  { id: "xhs", label: "小红书" },
  { id: "amazon", label: "亚马逊(跨境)" },
  { id: "global", label: "跨境独立站" },
] as const;
export type SuitePlatform = (typeof SUITE_PLATFORMS)[number]["id"];

// [已弃用] 旧的 build 期充值开关。前端门控已改成 SSR 注入的 PaymentProvider
// (见 @/lib/payment-context + getPaymentStatus),后台 DB 开关 + env 兜底实时生效,
// 两站一套代码。此常量保留仅为兼容,任何组件都不应再用它做门控。
export const RECHARGE_ENABLED =
  (process.env.NEXT_PUBLIC_RECHARGE_ENABLED ?? "").trim() === "true";

// 分 → ¥ 显示字符串（整数不带小数，含角分则保留两位）。
export function fenToYuan(fen: number): string {
  const yuan = fen / 100;
  return `¥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2)}`;
}

export type CreditPack = {
  id: string;
  credits: number; // 到账总积分(基础 + 加赠)
  base: number; // 基础积分(= 价格 ×10)
  bonus: number; // 加赠积分
  price: string; // ¥ 显示
  priceValue: number; // 元
  fen: number; // 分
  discount?: string; // 约 X 折(仅有加赠的档显示)
};

// 千分位:990 → "990",6240 → "6,240"
export function fmtCredits(n: number): string {
  return n.toLocaleString("en-US");
}

export type Artwork = {
  id: string;
  title: string;
  category: Category;
  prompt: string;
  createdAt: string;
  status: "completed" | "processing" | "failed";
  image: string;
  gradient: string;
  style?: string;
  ratio?: string;
  resolution?: string;
  source?: string;
  batchId?: string | null; // 一键套图同批次共用一个 batchId,作品页按它分组
  parentId?: string | null; // 血缘:这张图基于哪张作品生成(图生图底图),根图为 null
  parentIds?: string[] | null; // 多输入:额外父节点(合并多张参考图)
  templateId?: string | null; // 模板原图根节点代表的模板 id
  canvasX?: number | null; // 画布手动拖拽记住的坐标
  canvasY?: number | null;
  width?: number | null; // 图片真实像素宽度
  height?: number | null;
  processingKind?: "base" | "resize" | "native" | "ai-upscale" | "imagegen" | null;
  postprocessStatus?: "succeeded" | "failed-kept-base" | "pending" | null;
  canvasWidth?: number | null; // 图片节点在无限画布中的显示宽度，与原图像素分离
  canvasHeight?: number | null;
  groupId?: string | null; // 稳定项目分组:同项目所有节点共享,删节点也不变
  canvasGroupId?: string | null; // 画布编辑分组:用于成组/解组和整体移动,不代表生成血缘
  origin?: string | null; // "canvas"=在画布里产出(永远留画布);空=普通产出
  marked?: boolean; // 画布节点标记:用户手动钉住的重要版本
  videoUrl?: string | null; // 视频产物地址(有值=画布上按视频节点渲染)
};

export const IMAGE_NODE_DEFAULT_LONG_SIDE = 420;
export const IMAGE_NODE_MAX_LONG_SIDE = 720;
export const IMAGE_NODE_MIN_SHORT_SIDE = 120;

/**
 * 将任意原图尺寸映射为画布上的舒适初始尺寸。原图像素保持不变，
 * 这里只决定无限画布节点的可视大小，避免高分辨率图片过大或缩得看不清。
 */
export function adaptiveCanvasImageSize(width?: number | null, height?: number | null) {
  const sourceWidth = Number(width);
  const sourceHeight = Number(height);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return { width: 320, height: 200 };
  }
  const longSide = Math.max(sourceWidth, sourceHeight);
  const shortSide = Math.min(sourceWidth, sourceHeight);
  const scale = Math.min(
    IMAGE_NODE_MAX_LONG_SIDE / longSide,
    Math.max(
      IMAGE_NODE_DEFAULT_LONG_SIDE / longSide,
      IMAGE_NODE_MIN_SHORT_SIDE / shortSide
    )
  );
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export const ARTWORKS: Artwork[] = [
  {
    id: "art-001",
    title: "玻尿酸精华·白底主图",
    category: "main",
    prompt: "高端护肤品瓶身，纯白背景，柔和顶光，极简构图",
    createdAt: "2026-05-15T09:24:00Z",
    status: "completed",
    image: img(IMAGES.skincare[4]),
    gradient: "from-rose-100 to-slate-100",
  },
  {
    id: "art-002",
    title: "夏季连衣裙·街拍场景",
    category: "scene",
    prompt: "时尚女装街拍，城市街道虚化背景，自然日光",
    createdAt: "2026-05-15T08:02:00Z",
    status: "completed",
    image: img(IMAGES.fashion[3]),
    gradient: "from-emerald-100 to-lime-100",
  },
  {
    id: "art-003",
    title: "618 大促·首页 Banner",
    category: "banner",
    prompt: "电商大促横版 banner，左侧留文案区，渐变背景",
    createdAt: "2026-05-14T16:48:00Z",
    status: "completed",
    image: img(IMAGES.ecommerce[2]),
    gradient: "from-orange-100 to-pink-100",
  },
  {
    id: "art-004",
    title: "无线耳机·科技感主图",
    category: "main",
    prompt: "数码产品悬浮于深色科技背景，蓝紫光效",
    createdAt: "2026-05-14T11:15:00Z",
    status: "processing",
    image: img(IMAGES.digital[3]),
    gradient: "from-sky-100 to-teal-100",
  },
  {
    id: "art-005",
    title: "坚果零食·小红书封面",
    category: "xiaohongshu",
    prompt: "小红书竖版封面，零食种草，明亮活力配色",
    createdAt: "2026-05-13T20:30:00Z",
    status: "completed",
    image: img(IMAGES.food[3]),
    gradient: "from-amber-100 to-orange-100",
  },
  {
    id: "art-006",
    title: "纯棉四件套·详情首屏",
    category: "detail",
    prompt: "家居详情页首屏，居中产品大图，留卖点区",
    createdAt: "2026-05-13T10:05:00Z",
    status: "failed",
    image: img(IMAGES.home[3]),
    gradient: "from-slate-100 to-zinc-100",
  },
];

export const GENERATION_RATIOS = [
  { id: "auto", label: "默认", w: 0, h: 0 },
  { id: "1:1", label: "主图 1:1", w: 1, h: 1 },
  { id: "3:4", label: "竖版 3:4", w: 3, h: 4 },
  { id: "4:3", label: "横版 4:3", w: 4, h: 3 },
  { id: "16:9", label: "Banner 16:9", w: 16, h: 9 },
  { id: "9:16", label: "长图 9:16", w: 9, h: 16 },
];

export const GENERATION_STYLES = [
  "默认",
  "白底极简",
  "高级质感",
  "生活场景",
  "科技未来",
  "小红书风",
  "节日促销",
];

// 分辨率能力元数据；价格由计费配置提供。
// 2K / 4K / 5K 在生成后由服务端放大到对应长边像素（见 generate-image route）。
export const MAX_GENERATION_DIMENSION = 5120;

export type ResolutionTier = {
  id: string;
  label: string;
  /** 放大目标长边像素；0 表示不放大（沿用模型原生尺寸）。 */
  longSide: number;
};

export const GENERATION_RESOLUTIONS: ResolutionTier[] = [
  { id: "1K", label: "1K 标准", longSide: 0 },
  { id: "2K", label: "2K 高清", longSide: 2048 },
  { id: "4K", label: "4K 超清", longSide: 4096 },
  { id: "5K", label: "5K 专业", longSide: MAX_GENERATION_DIMENSION },
];

export function isGenerationResolution(id: string): boolean {
  return GENERATION_RESOLUTIONS.some((resolution) => resolution.id === id);
}

export function resolutionForLongSide(longSide: number): string {
  if (longSide > 4096) return "5K";
  if (longSide > 2048) return "4K";
  if (longSide > 1536) return "2K";
  return "1K";
}

/** 内部成本审计条目:成功图片的实际扣分与测试成本估算。 */
export type QualityCostAudit = {
  /** 用户被扣费所依据的请求档 */
  requestedQuality: string;
  /** 实际执行档(回退后) */
  executedQuality: string;
  /** 真实触发的上游(byok:<model> / default:<model>) */
  upstream: string;
  images: number;
  /** 用户实扣积分(读取已提交的积分流水) */
  billedCredits: number;
  /** 按测试价目估算的平台成本积分，不代表供应商货币成本 */
  costCredits: number;
  /** 测试积分差额 = 实扣 - 估算成本；平台补贴可为负 */
  marginCredits: number;
  /** 回退原因:quality-downgrade=同通道退档 / provider-fallback=换默认API */
  reason: string;
};

export function resolutionLongSide(id: string): number {
  return GENERATION_RESOLUTIONS.find((r) => r.id === id)?.longSide ?? 0;
}
