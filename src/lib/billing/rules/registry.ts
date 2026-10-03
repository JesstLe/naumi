export const FEATURE_IDS = ["image.generate", "image.suite", "image.aplus", "tool.cutout", "tool.upscale", "tool.printfile", "tool.ipcheck", "tool.garment", "tool.avatar", "tool.dewrinkle", "tool.dewatermark", "tool.style", "tool.tryon", "tool.retouch", "tool.recolor", "tool.replicate", "tool.inpaint", "tool.extract", "tool.garment3d", "tool.packaging3d", "canvas.image", "canvas.expand", "canvas.text-edit", "canvas.annotate", "competitor.action", "video.generate"] as const;
export type FeatureId = typeof FEATURE_IDS[number];
export const QUALITY_IDS = ["low", "medium", "high", "xhigh", "max", "auto"] as const;
export const RESOLUTION_IDS = ["1K", "2K", "4K", "5K"] as const;
export function isFeatureId(value: unknown): value is FeatureId { return typeof value === "string" && (FEATURE_IDS as readonly string[]).includes(value); }
