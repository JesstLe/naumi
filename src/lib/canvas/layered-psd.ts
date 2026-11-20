import sharp from "sharp";

export const MAX_LAYER_COUNT = 17;
export const MAX_LAYER_SIZE = 4096;
const MAX_LAYER_BYTES = 64 * 1024 * 1024;
const MAX_LAYER_PIXELS = 24 * 1024 * 1024;

export type ImageLayer = { name: string; left: number; top: number; width: number; height: number; placedWidth?: number; placedHeight?: number; bytes: Buffer };
export type LayerStack = { width: number; height: number; layers: ImageLayer[] };

export function layerName(value: string, index: number) {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 80) || (index === 0 ? "背景" : `图层 ${index}`);
}

/** The stack is bottom to top. The base is the model's reconstructed background.
 * Keeping the input image behind the overlays would retain duplicate subjects. */
export async function encodeLayeredPsd(stack: LayerStack): Promise<Buffer> {
  const { width, height, layers } = stack;
  if (![width, height].every(size => Number.isInteger(size) && size > 0 && size <= MAX_LAYER_SIZE)
      || layers.length < 2 || layers.length > MAX_LAYER_COUNT
      || layers.reduce((total, layer) => total + layer.bytes.length, 0) > MAX_LAYER_BYTES) {
    throw new Error("图层尺寸、数量或文件大小超出导出范围");
  }

  let pixelCount = width * height;
  const decoded = [];
  const overlays = [];
  for (const [index, layer] of layers.entries()) {
    const { left, top, bytes } = layer;
    if (!Number.isInteger(left) || !Number.isInteger(top) || left < 0 || top < 0) throw new Error("图层位置无效");
    const image = sharp(bytes, { failOn: "error", limitInputPixels: MAX_LAYER_SIZE ** 2 });
    const meta = await image.metadata();
    const w = layer.placedWidth ?? layer.width, h = layer.placedHeight ?? layer.height;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || meta.width !== layer.width || meta.height !== layer.height
        || left + w > width || top + h > height || (meta.pages ?? 1) !== 1
        || (index === 0 && (left !== 0 || top !== 0 || w !== width || h !== height || layer.width !== w || layer.height !== h))
        || (index !== 0 && (meta.format !== "png" || !meta.hasAlpha))) {
      throw new Error("背景尺寸或透明图层格式无效");
    }
    pixelCount += Math.max(w * h, layer.width * layer.height);
    if (pixelCount > MAX_LAYER_PIXELS) throw new Error("图层像素总量超出导出范围");
    if (layer.width !== w || layer.height !== h) image.resize(w, h, { fit: "fill" });
    const data = await image.toColourspace("srgb").ensureAlpha().raw().toBuffer();
    let visible = false, transparent = false;
    for (let offset = 3; offset < data.length && (!visible || !transparent); offset += 4) {
      visible ||= data[offset] > 0;
      transparent ||= data[offset] < 255;
    }
    if (!visible || (index > 0 && left === 0 && top === 0 && w === width && h === height && !transparent)) {
      throw new Error("图层为空或覆盖整张图片，无法单独编辑");
    }
    decoded.push({ name: layerName(layer.name, index), left, top, imageData: { width: w, height: h, data } });
    if (index > 0) overlays.push({ input: data, raw: { width: w, height: h, channels: 4 as const }, left, top });
  }

  const composite = await sharp(decoded[0].imageData.data, { raw: { width, height, channels: 4 } })
    .composite(overlays).raw().toBuffer();
  const { writePsdBuffer } = await import("ag-psd");
  return writePsdBuffer({ width, height, imageData: { width, height, data: composite }, children: decoded });
}
