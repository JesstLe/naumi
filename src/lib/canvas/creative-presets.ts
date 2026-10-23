/**
 * Original, local-only creative vocabulary. A preset is descriptive text, never
 * a generation configuration. Consumers must append to their latest prompt.
 */
export type CreativePresetCategory = "color" | "style" | "camera";

export type CreativePreset = Readonly<{
  id: string;
  category: CreativePresetCategory;
  label: string;
  description: string;
  promptFragment: string;
  swatches: readonly [string, string, string, string];
  tags: readonly string[];
}>;

export const CREATIVE_PRESET_CATEGORIES = [
  { id: "color", label: "配色" },
  { id: "style", label: "风格" },
  { id: "camera", label: "镜头" },
] as const satisfies readonly { id: CreativePresetCategory; label: string }[];

export const CREATIVE_PRESETS = [
  {
    id: "color-mist-blue", category: "color", label: "雾蓝米白", description: "清透 · 柔和",
    promptFragment: "雾蓝与米白为主色，少量石墨灰点缀，低饱和、柔和明亮",
    swatches: ["#a8bdca", "#f4f0e7", "#d5dfe4", "#596775"], tags: ["蓝色", "中性", "清新"],
  },
  {
    id: "color-warm-sand", category: "color", label: "暖沙奶油", description: "温暖 · 松弛",
    promptFragment: "暖沙、奶油白与浅陶色搭配，色彩温润，明暗过渡细腻",
    swatches: ["#d7b895", "#f8edda", "#c89076", "#eee0cd"], tags: ["米色", "大地色", "温暖"],
  },
  {
    id: "color-natural-green", category: "color", label: "自然青绿", description: "有机 · 清爽",
    promptFragment: "鼠尾草绿与苔绿搭配暖白，辅以浅木色，呈现自然清爽的色彩层次",
    swatches: ["#a9b9a0", "#4e7160", "#f0f1e7", "#d4b992"], tags: ["绿色", "植物", "自然"],
  },
  {
    id: "color-navy", category: "color", label: "海军蓝", description: "沉静 · 利落",
    promptFragment: "海军蓝与冷白形成清晰对比，少量银灰提亮，色调沉静利落",
    swatches: ["#263e61", "#f2f5f8", "#a7b4c4", "#607b9b"], tags: ["蓝色", "冷色", "经典"],
  },
  {
    id: "color-high-key", category: "color", label: "高调单色", description: "明亮 · 克制",
    promptFragment: "高调单色配色，以柔白、浅灰和银灰构成细微层次，明亮而克制",
    swatches: ["#faf9f5", "#ecece8", "#d1d4d2", "#aeb5b5"], tags: ["白色", "灰色", "单色", "极简"],
  },
  {
    id: "color-rose", category: "color", label: "灰粉玫瑰", description: "细腻 · 轻盈",
    promptFragment: "灰粉与玫瑰豆沙色搭配象牙白，降低饱和度，呈现细腻轻盈的色调",
    swatches: ["#d9b6bd", "#b7808d", "#f6eee8", "#d3c6c5"], tags: ["粉色", "柔和", "优雅"],
  },
  {
    id: "color-citrus", category: "color", label: "柑橘薄荷", description: "鲜活 · 轻快",
    promptFragment: "柑橘橙与薄荷绿形成轻快对比，奶白留出呼吸感，色彩鲜活清晰",
    swatches: ["#edab65", "#a9d0bc", "#fff5e5", "#457e70"], tags: ["橙色", "绿色", "活力", "夏日"],
  },
  {
    id: "color-lilac", category: "color", label: "丁香暮紫", description: "朦胧 · 安静",
    promptFragment: "丁香紫与雾灰搭配浅杏白，柔和冷暖交织，营造安静朦胧的色彩氛围",
    swatches: ["#b5a7c8", "#ddd7e7", "#f5e9df", "#746781"], tags: ["紫色", "柔和", "梦幻"],
  },
  {
    id: "color-terracotta", category: "color", label: "陶土赭红", description: "质朴 · 醇厚",
    promptFragment: "陶土红、赭石与燕麦白搭配，色彩醇厚温暖，保留自然质朴的层次",
    swatches: ["#b56951", "#d5a173", "#eee4d5", "#76564a"], tags: ["红色", "棕色", "大地色"],
  },
  {
    id: "color-butter", category: "color", label: "奶油浅黄", description: "轻柔 · 日光",
    promptFragment: "奶油黄与柔白为主色，浅蜂蜜色点缀，呈现轻柔明净的日光感",
    swatches: ["#f0dda1", "#fcf8e9", "#d5b568", "#e9e5d4"], tags: ["黄色", "奶油", "明亮"],
  },
  {
    id: "style-product-studio", category: "style", label: "产品棚拍", description: "柔光 · 精致质感",
    promptFragment: "产品棚拍质感，柔光均匀，接触阴影细腻，材质与边缘细节清晰",
    swatches: ["#d9dbd6", "#f6f5ef", "#a6b3a8", "#7e8d82"], tags: ["摄影", "商业", "产品", "静物"],
  },
  {
    id: "style-clear-glass", category: "style", label: "通透玻璃", description: "折射 · 轻盈光泽",
    promptFragment: "通透玻璃质感，光线轻柔折射，边缘高光干净，保留轻盈的透明层次",
    swatches: ["#c5dce5", "#eff8fa", "#8eb2c4", "#d3cbe9"], tags: ["透明", "折射", "材质", "光泽"],
  },
  {
    id: "style-layered-paper", category: "style", label: "层叠纸艺", description: "剪裁 · 手作层次",
    promptFragment: "层叠纸艺表现，纸张纤维细腻，剪裁边缘利落，浅浮雕阴影形成手作层次",
    swatches: ["#d8bca0", "#f4e8d4", "#b98b70", "#e7d4b5"], tags: ["纸艺", "手工", "剪纸", "插画"],
  },
  {
    id: "style-minimal-poster", category: "style", label: "极简海报", description: "几何 · 呼吸留白",
    promptFragment: "极简海报语言，简洁几何与克制的视觉层级，留白充足，构成清晰",
    swatches: ["#e8e5de", "#fbf8f1", "#d56f54", "#333e4e"], tags: ["设计", "平面", "海报", "留白"],
  },
  {
    id: "style-film-grain", category: "style", label: "复古胶片", description: "颗粒 · 温柔反差",
    promptFragment: "复古胶片质感，细腻颗粒与柔和反差，暖色高光，暗部保留丰富细节",
    swatches: ["#b2a084", "#e5d8b8", "#6c7a66", "#a97858"], tags: ["摄影", "胶片", "复古", "颗粒"],
  },
  {
    id: "style-natural-documentary", category: "style", label: "自然纪实", description: "自然光 · 真实触感",
    promptFragment: "自然纪实摄影，自然光照明，保留真实纹理与细微不完美，氛围松弛",
    swatches: ["#b4bca1", "#ede9d9", "#6e8260", "#b7a58c"], tags: ["摄影", "生活", "自然", "真实"],
  },
  {
    id: "style-soft-clay", category: "style", label: "柔软陶塑", description: "圆润 · 哑光肌理",
    promptFragment: "柔软陶塑风格，轮廓圆润，哑光表面带细微手塑痕迹，光影温和",
    swatches: ["#d1b2a9", "#f3e5dc", "#b28a82", "#dbcaad"], tags: ["三维", "陶艺", "黏土", "立体"],
  },
  {
    id: "style-editorial-collage", category: "style", label: "编辑拼贴", description: "裁切 · 节奏构成",
    promptFragment: "编辑式拼贴语言，纸张与图形错落叠放，裁切大胆，画面节奏清晰",
    swatches: ["#d9a884", "#eee9dd", "#68788b", "#b16e5a"], tags: ["设计", "拼贴", "杂志", "平面"],
  },
  {
    id: "camera-close", category: "camera", label: "近景", description: "靠近主体",
    promptFragment: "近景取景，主体占据主要画面，保留少量环境线索，视觉重点集中",
    swatches: ["#c6d3ce", "#f2f5ef", "#78918a", "#b1c3b9"], tags: ["构图", "近距离", "局部"],
  },
  {
    id: "camera-detail", category: "camera", label: "细节特写", description: "聚焦纹理",
    promptFragment: "细节特写，聚焦局部纹理与材质，焦点清晰，背景柔和虚化",
    swatches: ["#c8d5e0", "#f0f4f8", "#8096b0", "#b8c8da"], tags: ["微距", "细节", "局部", "景深"],
  },
  {
    id: "camera-overhead", category: "camera", label: "正上俯拍", description: "垂直向下",
    promptFragment: "正上方垂直俯拍，平面关系清晰，物体间距有序，轮廓完整可辨",
    swatches: ["#dfcdb7", "#f8f1e6", "#b99e80", "#e5d9c7"], tags: ["俯视", "顶视", "平铺", "构图"],
  },
  {
    id: "camera-eye-level", category: "camera", label: "平视", description: "自然视线",
    promptFragment: "平视视角，镜头与主体视觉中心齐平，透视自然，距离感亲近",
    swatches: ["#cbd6c5", "#f1f4ea", "#8b9d80", "#d9dfc9"], tags: ["正面", "自然", "水平"],
  },
  {
    id: "camera-low-angle", category: "camera", label: "低角度", description: "由下向上",
    promptFragment: "低角度仰拍，视线由下向上，突出主体轮廓与体积，透视有张力",
    swatches: ["#c8d4e2", "#edf3fb", "#8398b4", "#adbdd3"], tags: ["仰视", "仰拍", "透视", "力量"],
  },
  {
    id: "camera-isometric", category: "camera", label: "等距视角", description: "立体结构",
    promptFragment: "等距视角，平行边线保持一致方向，立体结构清楚，空间关系有序",
    swatches: ["#d3c9df", "#f3eff8", "#9f8ab4", "#c2b3d1"], tags: ["等轴", "立体", "空间", "构图"],
  },
  {
    id: "camera-telephoto", category: "camera", label: "长焦", description: "空间压缩",
    promptFragment: "长焦视感，适度压缩前后空间，主体轮廓自然，背景层次柔和分离",
    swatches: ["#c9d4d0", "#edf3f0", "#7d9990", "#adbfba"], tags: ["景深", "远摄", "压缩", "镜头"],
  },
  {
    id: "camera-wide", category: "camera", label: "广角环境", description: "展开空间",
    promptFragment: "广角环境取景，展开前中后景的空间层次，环境线索丰富，主体重点明确",
    swatches: ["#d8ccb7", "#f7f2e8", "#a48f6e", "#d1bb97"], tags: ["全景", "广角", "空间", "环境"],
  },
] as const satisfies readonly CreativePreset[];

/** Search only the chosen category; multiple terms all need to match. */
export function filterCreativePresets(category: CreativePresetCategory, query = ""): CreativePreset[] {
  const terms = query.normalize("NFKC").toLowerCase().trim().split(/\s+/u).filter(Boolean);
  return CREATIVE_PRESETS.filter(preset => {
    if (preset.category !== category) return false;
    const text = [preset.label, preset.description, preset.promptFragment, ...preset.tags].join(" ").normalize("NFKC").toLowerCase();
    return terms.every(term => text.includes(term));
  });
}

function fragmentKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim().replace(/[。.!！?？;；]+$/u, "").trim();
}

/**
 * Append one descriptive fragment, preserving every character of the original.
 * Deduplication compares whole normalized lines/sentence clauses, not arbitrary
 * substrings ("soft" must not be mistaken for "soft lighting"). There is no
 * length clamp: an existing prompt is never silently rewritten or truncated.
 */
export function appendCreativePreset(prompt: string, preset: CreativePreset | string): string {
  const fragment = (typeof preset === "string" ? preset : preset.promptFragment).trim();
  const key = fragmentKey(fragment);
  if (!key) return prompt;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").split(" ").join("\\s+");
  const wholeFragment = new RegExp(`(?:^|[\\r\\n;；。.!！?？])\\s*${escaped}\\s*(?=$|[\\r\\n;；。.!！?？])`, "u");
  if (wholeFragment.test(prompt.normalize("NFKC").toLowerCase())) return prompt;
  if (!prompt) return fragment;
  return `${prompt}${/[\r\n]$/u.test(prompt) ? "" : "\n"}${fragment}`;
}
