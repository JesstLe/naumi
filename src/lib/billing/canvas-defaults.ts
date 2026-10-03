import type { FeatureTariff } from "./types";

// Only newly introduced optional features receive defaults when reading an old
// immutable version. Missing original tariffs still fail validation.
export const CANVAS_FREE_DEFAULTS = {
    "canvas.text-generate": "画布文字生成与提示词",
    "canvas.assistant": "画布助手对话",
    "canvas.ocr": "画布文字识别（OCR）",
} as const;
export function freeCanvasTariff(label: string): FeatureTariff {
    return { label, enabled: false, unit: "task", pricing: { mode: "fixed", credits: 0 }, settlement: { qualityBasis: "requested", successBasis: "successful-units", failureBps: 0, byokBps: 10000, reserveBps: 10000, unknown: "hold" }, rules: [] };
}
export function withCanvasDefaults(value: unknown): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const config = value as Record<string, unknown>;
    if (!config.features || typeof config.features !== "object" || Array.isArray(config.features)) return value;
    const features = { ...config.features as Record<string, unknown> };
    for (const [id, label] of Object.entries(CANVAS_FREE_DEFAULTS))
        if (!Object.prototype.hasOwnProperty.call(features, id)) features[id] = freeCanvasTariff(label);
    return { ...config, features };
}
