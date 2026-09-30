import "server-only";

import path from "node:path";

import {
  dataUrlToBytes,
  isManagedImageUrl,
  readManagedObject,
} from "@/lib/storage";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function mimeFromPath(value: string) {
  const ext = path.extname(value.split("?", 1)[0]).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function allowedRemoteImage(url: URL, requestUrl: string) {
  const requestHost = new URL(requestUrl).host;
  if (url.host === requestHost) return true;
  for (const base of [
    process.env.R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_IMAGE_BASE_URL,
  ]) {
    if (!base) continue;
    try {
      if (url.host === new URL(base).host) return true;
    } catch {
      /* ignore invalid deployment config */
    }
  }
  return url.protocol === "https:" && url.host.endsWith(".r2.dev");
}

export async function readCanvasImage(source: string, requestUrl: string) {
  const inline = dataUrlToBytes(source);
  if (inline) {
    if (inline.bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("图片超过 12MB");
    return {
      buffer: Buffer.from(inline.bytes),
      mimeType: inline.contentType || "image/png",
    };
  }

  if (isManagedImageUrl(source)) {
    const object = await readManagedObject(source, MAX_IMAGE_BYTES);
    return {
      buffer: object.bytes,
      mimeType:
        object.contentType === "application/octet-stream"
          ? mimeFromPath(source)
          : object.contentType,
    };
  }

  const sameOrigin = source.startsWith("/") && !source.startsWith("//");
  const target = sameOrigin ? new URL(source, requestUrl) : new URL(source);
  if (!sameOrigin && !allowedRemoteImage(target, requestUrl)) {
    throw new Error("图片来源不受支持");
  }
  const response = await fetch(target, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`读取图片失败 (${response.status})`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_IMAGE_BYTES) throw new Error("图片超过 12MB");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("图片超过 12MB");
  return {
    buffer,
    mimeType: response.headers.get("content-type") || mimeFromPath(source),
  };
}
