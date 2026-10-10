/** Original generated demonstration assets. Not a tool benchmark or risk verdict. */
export type ToolDemoConfig = {
  title: string;
  before?: string;
  after?: string;
  combo?: string;
  gallery?: string[];
  beforeLabel?: string;
  beforeLabelEn?: string;
  afterLabel?: string;
  afterLabelEn?: string;
  transparent?: boolean;
};
export const TOOL_DEMO_ASSET_ROOT = "/demos/workbench-v2";
const pair = (key: string, title: string, extra: Partial<ToolDemoConfig> = {}): ToolDemoConfig => ({
  title, before: `${TOOL_DEMO_ASSET_ROOT}/${key}-before.webp`, after: `${TOOL_DEMO_ASSET_ROOT}/${key}-after.webp`, ...extra,
});
export const TOOL_DEMOS: Record<string, ToolDemoConfig> = {
  upscale: pair("upscale", "高清修复"),
  cutout: pair("cutout", "主体抠图", { transparent: true, afterLabel: "透明底", afterLabelEn: "Transparent" }),
  style: pair("style", "风格转换"),
  garment: pair("garment", "服装提取"),
  dress3d: pair("dress3d", "3D 服装图"),
  dewrinkle: pair("dewrinkle", "服装去皱"),
  agent: pair("agent", "多步创作", { afterLabel: "系列示例", afterLabelEn: "Series example" }),
  avatar: pair("avatar", "人像抠取"),
  packaging3d: pair("packaging3d", "包装 3D 效果", { beforeLabel: "平面稿", beforeLabelEn: "Dieline" }),
  replicate: pair("replicate", "商业视觉复刻", { beforeLabel: "商品与参考", beforeLabelEn: "Product & reference" }),
  retouch: pair("retouch", "商品精修"),
  recolor: pair("recolor", "商品换色"),
  print: pair("print", "印花提取"),
  variation: pair("variation", "系列图裂变", { afterLabel: "系列示例", afterLabelEn: "Series example" }),
  fusion: pair("fusion", "多图融合", { beforeLabel: "输入素材", beforeLabelEn: "Source images" }),
  inpaint: pair("inpaint", "局部改图"),
  printfile: pair("printfile", "印刷图准备"),
  tryon: pair("tryon", "服装试穿", { beforeLabel: "模特与服装", beforeLabelEn: "Model & garment" }),
  titles: pair("titles", "商品文案", { afterLabel: "文案示例", afterLabelEn: "Copy example" }),
  image: pair("image", "场景生图"),
  suite: pair("suite", "电商套图", { afterLabel: "套图示例", afterLabelEn: "Suite example" }),
  ipcheck: { title: "图片风险筛查", gallery: [1, 2, 3].map(i => `${TOOL_DEMO_ASSET_ROOT}/ipcheck-${i}.webp`) },
  dewatermark: pair("dewatermark", "移除自有水印"),
};

export const SUITE_DEMO_SETS = [
  { key: "coffee", label: "咖啡机", src: `${TOOL_DEMO_ASSET_ROOT}/suite-coffee-src.webp`, shots: [
    { tag: "主图", img: `${TOOL_DEMO_ASSET_ROOT}/suite-coffee-main.webp` },
    { tag: "场景展示", img: `${TOOL_DEMO_ASSET_ROOT}/suite-coffee-scene.webp` },
    { tag: "细节特写", img: `${TOOL_DEMO_ASSET_ROOT}/suite-coffee-detail.webp` },
    { tag: "结构展示", img: `${TOOL_DEMO_ASSET_ROOT}/suite-coffee-structure.webp` },
  ] },
  { key: "speaker", label: "便携音箱", src: `${TOOL_DEMO_ASSET_ROOT}/suite-speaker-src.webp`, shots: [
    { tag: "主图", img: `${TOOL_DEMO_ASSET_ROOT}/suite-speaker-main.webp` },
    { tag: "场景展示", img: `${TOOL_DEMO_ASSET_ROOT}/suite-speaker-scene.webp` },
    { tag: "细节特写", img: `${TOOL_DEMO_ASSET_ROOT}/suite-speaker-detail.webp` },
    { tag: "结构展示", img: `${TOOL_DEMO_ASSET_ROOT}/suite-speaker-structure.webp` },
  ] },
] as const;
