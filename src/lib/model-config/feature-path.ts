import type { FeatureId } from "../billing/rules/registry";
const paths: Record<string, FeatureId> = {
  "/api/generate-image": "image.generate", "/api/suite": "image.suite", "/api/aplus": "image.aplus",
  "/api/canvas/image-tasks": "canvas.image", "/api/canvas/expand": "canvas.expand", "/api/canvas/text-edit": "canvas.text-edit", "/api/canvas/annotate": "canvas.annotate", "/api/canvas/text-generate": "canvas.text-generate", "/api/canvas/assistant": "canvas.assistant", "/api/canvas/ocr": "canvas.ocr", "/api/video/generate": "video.generate",
  ...Object.fromEntries(["cutout", "upscale", "printfile", "ipcheck", "garment", "avatar", "dewrinkle", "dewatermark", "style", "tryon", "retouch", "recolor", "replicate", "inpaint", "extract", "garment3d", "packaging3d"].map(id => [`/api/${id}`, `tool.${id}` as FeatureId])),
};
export function featureForPath(path: string): FeatureId | undefined {
  if (/^\/api\/competitors\/[^/]+\/action$/.test(path)) return "competitor.action";
  return paths[path];
}
