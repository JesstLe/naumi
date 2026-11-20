import { z } from "zod";
import type { Layer, Psd } from "ag-psd";

const coord = z.number().int().min(-8192).max(8192);
const stroke = z.object({
  restore: z.boolean(),
  radius: z.number().int().min(1).max(128),
  points: z
    .array(z.tuple([coord, coord]))
    .min(1)
    .max(4096),
});
export const psdEditsSchema = z
  .array(
    z.object({
      index: z.number().int().min(0).max(16),
      x: coord,
      y: coord,
      visible: z.boolean(),
      strokes: z.array(stroke).max(512),
    }),
  )
  .min(2)
  .max(17)
  .refine((layers) => new Set(layers.map((l) => l.index)).size === layers.length);
export type PsdEdits = z.infer<typeof psdEditsSchema>;
export type MaskStroke = z.infer<typeof stroke>;
export class InvalidLayerEdit extends Error {}

export function initialPsdEdits(psd: Psd): PsdEdits {
  return (psd.children ?? []).map((l, index) => ({
    index,
    x: l.left ?? 0,
    y: l.top ?? 0,
    visible: !l.hidden,
    strokes: [],
  }));
}

/** Stroke coordinates are local to the layer, so its matte follows every move. */
export function rasterMask(width: number, height: number, strokes: MaskStroke[]) {
  const mask = new Uint8Array(width * height).fill(255);
  let work = 0;
  for (const { points, radius, restore } of strokes) {
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i];
      const [a, b] = points[Math.max(0, i - 1)];
      const dx = x - a,
        dy = y - b,
        length = dx * dx + dy * dy;
      const top = Math.max(0, Math.min(y, b) - radius),
        bottom = Math.min(height - 1, Math.max(y, b) + radius);
      const left = Math.max(0, Math.min(x, a) - radius),
        right = Math.min(width - 1, Math.max(x, a) + radius);
      work += Math.max(0, bottom - top + 1) * Math.max(0, right - left + 1);
      if (work > 120_000_000) throw new InvalidLayerEdit("此图层蒙版过于复杂，请减少笔画");
      for (let v = top; v <= bottom; v++)
        for (let u = left; u <= right; u++) {
          const t = length ? Math.max(0, Math.min(1, ((u - a) * dx + (v - b) * dy) / length)) : 0;
          const distance = Math.hypot(u - a - t * dx, v - b - t * dy);
          const coverage = Math.min(1, Math.max(0, radius + 0.5 - distance));
          const at = v * width + u;
          mask[at] = Math.round(mask[at] * (1 - coverage) + (restore ? 255 : 0) * coverage);
        }
    }
  }
  return mask;
}

/** The same RGBA composite backs the editing surface, node thumbnail and PSD preview. */
export function composePsd(base: Psd, edits: PsdEdits): Psd {
  const originals = base.children ?? [];
  if (edits.length !== originals.length || edits.some((l) => !originals[l.index]?.imageData))
    throw new InvalidLayerEdit("图层与原始 PSD 不匹配");
  const { width, height } = base;
  const data = new Uint8ClampedArray(width * height * 4);
  const children: Layer[] = [];
  for (const edit of edits) {
    const original = originals[edit.index],
      pixels = original.imageData!;
    const w = pixels.width,
      h = pixels.height;
    const layer: Layer = {
      name: original.name,
      left: edit.x,
      top: edit.y,
      hidden: !edit.visible,
      imageData: pixels,
    };
    const mask = edit.strokes.length ? rasterMask(w, h, edit.strokes) : undefined;
    if (mask) {
      const rgba = new Uint8ClampedArray(mask.length * 4);
      for (let i = 0; i < mask.length; i++) {
        rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = mask[i];
        rgba[i * 4 + 3] = 255;
      }
      layer.mask = {
        left: edit.x,
        top: edit.y,
        defaultColor: 255,
        imageData: { width: w, height: h, data: rgba },
      };
    }
    children.push(layer);
    if (!edit.visible) continue;
    for (let y = Math.max(0, -edit.y); y < Math.min(h, height - edit.y); y++) {
      for (let x = Math.max(0, -edit.x); x < Math.min(w, width - edit.x); x++) {
        const i = y * w + x,
          dst = ((y + edit.y) * width + x + edit.x) * 4;
        const alpha = (pixels.data[i * 4 + 3] * (mask ? mask[i] / 255 : 1)) / 255;
        if (alpha === 0) continue;
        if (alpha === 1) {
          data[dst] = pixels.data[i * 4];
          data[dst + 1] = pixels.data[i * 4 + 1];
          data[dst + 2] = pixels.data[i * 4 + 2];
          data[dst + 3] = 255;
          continue;
        }
        const under = (data[dst + 3] / 255) * (1 - alpha),
          sum = alpha + under;
        for (let c = 0; c < 3; c++) data[dst + c] = (pixels.data[i * 4 + c] * alpha + data[dst + c] * under) / sum;
        data[dst + 3] = sum * 255;
      }
    }
  }
  return { width, height, children, imageData: { width, height, data } };
}
