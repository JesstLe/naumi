import "server-only";
import sharp from "sharp";

export async function sourceImageDimensions(bytes?: Buffer) {
  if (!bytes?.length) return undefined;
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) return undefined;
  return meta.orientation && meta.orientation >= 5 ? {width:meta.height,height:meta.width} : {width:meta.width,height:meta.height};
}

/** A requested aspect ratio is an upstream composition instruction, not consent to crop pixels. */
export async function preserveGeneratedFrame(bytes: Buffer, options: { targetWidth: number; targetHeight: number; transparent?: boolean }) {
  if (!(options.targetWidth > 0 && options.targetHeight > 0)) return bytes;
  // Explicit pixel dimensions are the sole local frame transform. Contain preserves
  // every source edge; no stretch, attention crop or destructive cover fallback.
  const meta = await sharp(bytes).metadata();
  return sharp(bytes).rotate().resize(options.targetWidth, options.targetHeight, {
    fit: "contain", background: meta.hasAlpha ? { r: 0, g: 0, b: 0, alpha: 0 } : "#ffffff", kernel: "lanczos3",
  }).png().toBuffer();
}
