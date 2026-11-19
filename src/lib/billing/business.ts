import type { FeatureId, FeatureTariff } from "./types";
import { FEATURE_LABELS } from "./labels";

export const QUALITY_LABELS: Record<string, string> = { low: "快速", medium: "标准", high: "精细", xhigh: "超精细", max: "最高质量", auto: "自动" };
export const BUSINESS_GROUPS: { id: string; label: string; description: string; features: FeatureId[] }[] = [
    { id: "images", label: "图片生成", description: "普通生图、商品套图、详情页与竞品衍生图", features: ["image.generate", "image.suite", "image.aplus", "competitor.action"] },
    { id: "tools", label: "图片工具", description: "抠图、放大、精修、换色及其他图片处理", features: ["tool.cutout", "tool.upscale", "tool.printfile", "tool.ipcheck", "tool.garment", "tool.avatar", "tool.dewrinkle", "tool.dewatermark", "tool.style", "tool.tryon", "tool.retouch", "tool.recolor", "tool.replicate", "tool.inpaint", "tool.extract", "tool.garment3d", "tool.packaging3d"] },
    { id: "canvas", label: "画布", description: "画布 AI 操作集中查看；生图、抠图和视频沿用对应功能的价格", features: ["canvas.image", "canvas.expand", "canvas.text-edit", "canvas.annotate", "canvas.text-generate", "canvas.assistant", "canvas.ocr", "canvas.layered-psd", "image.generate", "image.aplus", "tool.cutout", "video.generate"] },
    { id: "video", label: "视频", description: "视频工作台和画布中的视频生成使用同一套价格", features: ["video.generate"] },
];
export const FEATURE_DESCRIPTIONS: Partial<Record<FeatureId, string>> = {
    "image.generate": "普通生图、对话生图和画布中生成新图片。调整后这些入口一起生效。",
    "image.suite": "按所选套图方案的图片数量报价。",
    "image.aplus": "A+ 详情页及画布详情图生成，共用这项价格。",
    "tool.cutout": "抠图工具和画布中的 AI 抠图，共用这项价格。",
    "canvas.image": "画布中识别文字后的改字任务。目前该入口使用这项价格。",
    "canvas.expand": "画布中扩大图片边界并由 AI 补齐内容。",
    "canvas.text-edit": "早期改字方式保留独立价格。当前画布识别文字后的改字，请调整“画布图片改字”。",
    "canvas.annotate": "根据画布中的圈选、批注或蒙版修改图片。",
    "canvas.text-generate": "画布文字节点生成、反推提示词和智能帮写。默认免费；这些入口共用本项价格。",
    "canvas.assistant": "画布助手每轮回复。助手回复后点击生成图片，另按普通生图收费。",
    "canvas.ocr": "每次识别图片中的文字和位置算一次操作，不按识别出的文字段数扣费。随后提交改字任务会另按画布图片改字收费。",
    "canvas.layered-psd": "独立按一次拆层任务配置固定积分。预览、重新下载和切换可见图层不扣积分。",
    "video.generate": "视频工作台和画布生成视频。计费按结果数量或整笔任务，由下方单位决定。",
};
export function unitLabel(unit: FeatureTariff["unit"]) { return unit === "image" ? "张" : unit === "item" ? "个结果" : "次任务"; }
export function pricingSummary(tariff: FeatureTariff) {
    if (!tariff.enabled) return "免费";
    const p = tariff.pricing;
    if(p.mode==="matrix")return "按质量与分辨率价格表收费";
    if (p.mode === "fixed") return `${p.credits} 积分 / ${unitLabel(tariff.unit)}`;
    if (p.mode === "quality-resolution") return `${p.quality.medium + p.resolutionExtra["1K"]} 积分 / ${unitLabel(tariff.unit)}（标准 1K）`;
    return p.mode === "tiers" ? "按档位收费" : "按供应商成本加成";
}
export function costLabel(key: string) {
    if (FEATURE_LABELS[key as FeatureId]) return `${FEATURE_LABELS[key as FeatureId]} · 功能成本`;
    const parts = key.split(":");
    if (parts.length === 4) return `${parts[0] === "*" ? "全部供应商" : parts[0]} / ${parts[1] === "*" ? "全部模型" : parts[1]} / ${QUALITY_LABELS[parts[2]] || parts[2]} / ${parts[3]}`;
    return key;
}
