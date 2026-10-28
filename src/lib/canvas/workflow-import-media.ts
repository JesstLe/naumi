import "server-only";
import sharp from "sharp";
import {inertSvg,pathSvg} from "./workflow-vector";
import {gaodingAssetUrl,type ImportedElement} from "./workflow-clipboard";
import {fetchPublicImageBytes} from "../template-image-cache";
/** Only server-downloaded, decoded pixels are persisted. Never hotlink, trust MIME, or execute SVG. */
export async function prepareWorkflowPixels(node: ImportedElement, scale: number): Promise<{ bytes: Buffer; width: number; height: number; missingAsset?: string }> {
  let bytes: Buffer;
  if (node.kind === "path") bytes = Buffer.from(pathSvg(node.path, node.width / scale, node.height / scale, node.fill, node.stroke, node.strokeWidth));
  else if (node.kind === "svg" && node.svg) bytes = Buffer.from(inertSvg(node.svg));
  else {
    if (!node.url) return workflowPlaceholder(node, "素材地址缺失");
    let downloaded: Awaited<ReturnType<typeof fetchPublicImageBytes>>;
    try { downloaded = await fetchPublicImageBytes(gaodingAssetUrl(node.url), { allowSvg: node.kind === "svg", validate: gaodingAssetUrl }); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Network/access failures produce explicit placeholders. Unsafe URLs, oversized
      // resources and malicious SVG remain hard failures, never silently accepted.
      const status = /图片源返回 (\d{3})/.exec(message);
      if (status || /取图超时|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH/.test(message))
        return workflowPlaceholder(node, status ? `素材 HTTP ${status[1]}` : "素材连接失败");
      throw error;
    }
    bytes = downloaded.contentType === "image/svg+xml" ? Buffer.from(inertSvg(downloaded.bytes.toString("utf8"))) : downloaded.bytes;
  }
  let image = sharp(bytes, { limitInputPixels: 100000000 }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("图片素材无效");
  if (node.kind === "svg" || node.kind === "path") {
    // Rasterize vectors at canvas display density instead of enlarging a tiny PNG.
    const density = Math.max(1, Math.min(2304, 72 * Math.min(4096 / metadata.width,8192 / metadata.height,
      Math.max(node.width * 2 / metadata.width,node.height * 2 / metadata.height))));
    image = sharp(bytes,{density,limitInputPixels:100000000}).rotate();
  }
  const png = await image.resize({ width: 4096, height: 8192, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  if (png.data.length > 12 * 1024 * 1024) throw new Error("图片素材超过 12MB");
  return { bytes: png.data, width: png.info.width, height: png.info.height };
}

async function workflowPlaceholder(node: ImportedElement, missingAsset: string) {
  const ratio = node.width / node.height;
  const width = Math.max(1, Math.round(ratio >= 1 ? 320 : 320 * ratio));
  const height = Math.max(1, Math.round(ratio >= 1 ? 320 / ratio : 320));
  const bytes = await sharp({ create: { width, height, channels: 4, background: "#f1f5f9" } }).png().toBuffer();
  return { bytes, width, height, missingAsset };
}

