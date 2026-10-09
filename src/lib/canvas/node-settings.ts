import { z } from "zod";

export const nodeSettingsSchema = z.object({
  locked: z.boolean().default(false),
  order: z.number().int().min(-100000).max(100000).default(0),
  text: z.object({
    fontSize: z.number().int().min(12).max(72).default(12),
    fontWeight: z.enum(["400", "600", "700"]).default("400"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
    align: z.enum(["left", "center", "right"]).default("left"),
    lineHeight: z.number().min(1.2).max(2.4).default(1.65),
  }).strict().default({ fontSize: 12, fontWeight: "400", color: null, align: "left", lineHeight: 1.65 }),
}).strict();
export type CanvasNodeSettings = z.infer<typeof nodeSettingsSchema>;
export const defaultNodeSettings = (): CanvasNodeSettings => nodeSettingsSchema.parse({});
export function validNodeSettings(value: unknown): CanvasNodeSettings {
  const parsed = nodeSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultNodeSettings();
}
export function nodeTextStyle(settings: CanvasNodeSettings) {
  return { fontSize: settings.text.fontSize, fontWeight: Number(settings.text.fontWeight),
    color: settings.text.color || undefined, textAlign: settings.text.align, lineHeight: settings.text.lineHeight };
}

// Rectangles are fractions of the EXIF-normalized original, never model parameters.
export const cropSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().min(0.01).max(1), height: z.number().min(0.01).max(1) }).strict()
  .refine(r => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001, "裁剪区域超出图片");
export type CanvasCrop = z.infer<typeof cropSchema>;
export function pixelCrop(input: CanvasCrop, width: number, height: number) {
  const r = cropSchema.parse(input);
  const left = Math.min(width - 1, Math.floor(r.x * width));
  const top = Math.min(height - 1, Math.floor(r.y * height));
  return { left, top, width: Math.max(1, Math.min(width - left, Math.round(r.width * width))),
    height: Math.max(1, Math.min(height - top, Math.round(r.height * height))) };
}
