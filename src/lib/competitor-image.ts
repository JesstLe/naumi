import sharp from "sharp";
import type { CompetitorRegion } from "./competitor-types";

export function pixelRect(r: CompetitorRegion, width: number, height: number) {
  const left = Math.min(width - 1, Math.floor(r.x * width));
  const top = Math.min(height - 1, Math.floor(r.y * height));
  return {
    left, top,
    width: Math.max(1, Math.min(width, Math.ceil((r.x + r.width) * width)) - left),
    height: Math.max(1, Math.min(height, Math.ceil((r.y + r.height) * height)) - top),
  };
}

/** Same normalized geometry drives the displayed rectangles, mask, and compositing. */
export async function regionMask(width: number, height: number, regions: CompetitorRegion[]) {
  const mask = Buffer.alloc(width * height * 4, 255);
  for (const r of regions.filter(r => r.enabled)) {
    const p = pixelRect(r, width, height);
    for (let y = p.top; y < p.top + p.height; y++) {
      for (let x = p.left; x < p.left + p.width; x++) mask[(y * width + x) * 4 + 3] = 0;
    }
  }
  return sharp(mask, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Hard guarantee: copy edited RGBA pixels only inside transparent mask regions.
 * No global resize of the source, feathering, or lossy re-encoding. */
export async function preserveOutsideMask(source: Buffer, generated: Buffer, mask: Buffer) {
  const original = await sharp(source).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = original.info;
  const changed = await sharp(generated).rotate().resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  const alpha = await sharp(mask).resize(width, height, { fit: "fill", kernel: "nearest" }).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < width * height; i++) {
    if (alpha[i * 4 + 3] === 0) changed.copy(original.data, i * 4, i * 4, i * 4 + 4);
  }
  return sharp(original.data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
