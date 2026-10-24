import "server-only";
import {preserveGeneratedFrame} from "@/lib/imagegen/output-shape";
import {resolutionLongSide} from "@/lib/mock-data";
import {storageEnabled, uploadImage, dataUrlToBytes} from "@/lib/storage";
import type {GenParams,GeneratedImage} from "./generation-types";
export async function enforceOutputShape(images: GeneratedImage[], p: GenParams): Promise<GeneratedImage[]> {
  if (!(p.targetWidth > 0 && p.targetHeight > 0)) return images;
  return Promise.all(images.map(async image => {
    const decoded = dataUrlToBytes(image.url);
    if (!decoded) return image;
    const output = await preserveGeneratedFrame(Buffer.from(decoded.bytes), p);
    return { ...image, url: `data:image/png;base64,${output.toString("base64")}` };
  }));
}

export async function attachImageDimensions(images: GeneratedImage[]): Promise<GeneratedImage[]> {
  let sharp: typeof import("sharp");
  try {
    const mod = (await import("sharp")) as unknown as { default?: typeof import("sharp") } & typeof import("sharp");
    sharp = mod.default ?? mod;
  } catch { return images; }
  return Promise.all(images.map(async (image) => {
    const decoded = dataUrlToBytes(image.url);
    if (!decoded) return image;
    try {
      const meta = await sharp(Buffer.from(decoded.bytes)).metadata();
      const width = meta.orientation && meta.orientation >= 5 ? meta.height : meta.width;
      const height = meta.orientation && meta.orientation >= 5 ? meta.width : meta.height;
      const divisor = (a: number, b: number): number => b ? divisor(b, a % b) : a;
      const gcd = width && height ? divisor(width, height) : 0;
      return { ...image, width, height, ...(gcd ? { ratio: `${width! / gcd}:${height! / gcd}` } : {}) };
    } catch { return image; }
  }));
}

export async function upscaleImages(
  images: GeneratedImage[],
  resolution: string
): Promise<GeneratedImage[]> {
  const target = resolutionLongSide(resolution);
  if (!target) return images; // 1K / unknown -> native size
  let sharp: typeof import("sharp");
  try {
    // sharp is a CJS `export =` module; under Node ESM the callable lands on
    // `.default`, but the static type has no `default` — cast to read it.
    const mod = (await import("sharp")) as unknown as {
      default?: typeof import("sharp");
    } & typeof import("sharp");
    sharp = mod.default ?? mod;
  } catch {
    return images; // dependency unavailable -> degrade gracefully
  }
  return Promise.all(
    images.map(async (image) => {
      const decoded = dataUrlToBytes(image.url);
      if (!decoded) return image; // url-based result -> can't resize here
      try {
        const input = Buffer.from(decoded.bytes);
        const meta = await sharp(input).metadata();
        const longSide = Math.max(meta.width ?? 0, meta.height ?? 0);
        if (!longSide || longSide >= target) return image;
        const scale = target / longSide;
        const out = await sharp(input)
          .resize({
            width: Math.round((meta.width ?? 0) * scale),
            height: Math.round((meta.height ?? 0) * scale),
            kernel: "lanczos3",
            fit: "fill",
          })
          .png()
          .toBuffer();
        return {
          ...image,
          url: `data:image/png;base64,${out.toString("base64")}`,
        };
      } catch (e) {
        console.error(
          "[upscale] failed, keeping original:",
          e instanceof Error ? e.message : e
        );
        return image;
      }
    })
  );
}

export async function persistToStorage(
  images: GeneratedImage[]
): Promise<GeneratedImage[]> {
  if (!storageEnabled) return images;
  return Promise.all(
    images.map(async (image) => {
      const decoded = dataUrlToBytes(image.url);
      if (!decoded) return image;
      try {
        const ext = decoded.contentType.split("/")[1] ?? "png";
        const url = await uploadImage(
          decoded.bytes,
          decoded.contentType,
          `generations/${image.id}.${ext}`
        );
        return { ...image, url };
      } catch (e) {
        console.error(
          "[R2] upload failed, keeping inline image:",
          e instanceof Error ? e.message : e
        );
        return image;
      }
    })
  );
}
