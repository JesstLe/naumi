import "server-only";

import path from "node:path";

import { dataUrlToBytes, isManagedImageUrl, privateMedia, storageKeyFromManagedUrl } from "@/lib/object-storage/runtime";
import { readManagedObject } from "@/lib/object-storage/managed-read";
import {canReadMedia} from '@/lib/media-assets';
import { IMAGEGEN_OUTPUT_MAX_BYTES } from "./imagegen/image-limits";

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

export async function readCanvasImage(source: string, requestUrl: string, owner?:string) {
  return readOwnedCanvasImage(source, requestUrl, owner, MAX_IMAGE_BYTES);
}

/** Same ownership/source rules as inputs; only the bounded byte budget differs. */
export async function readCanvasOutput(source: string, requestUrl: string, owner: string) {
  return readOwnedCanvasImage(source, requestUrl, owner, IMAGEGEN_OUTPUT_MAX_BYTES);
}

async function readOwnedCanvasImage(source: string, requestUrl: string, owner: string | undefined, maxBytes: number) {
  const inline = dataUrlToBytes(source);
  if (inline) {
    if (inline.bytes.byteLength > maxBytes) throw new Error("图片超出当前读取大小限制");
    return {
      buffer: Buffer.from(inline.bytes),
      mimeType: inline.contentType || "image/png",
    };
  }

  try {
    const absolute = new URL(source);
    if (absolute.origin === new URL(requestUrl).origin && absolute.pathname.startsWith("/media/")) source = absolute.pathname;
  } catch { /* relative reference */ }
  if (isManagedImageUrl(source)) {
    if(privateMedia&&!await canReadMedia(storageKeyFromManagedUrl(source)!,owner||null))throw new Error('素材不存在或无权访问');
    const object = await readManagedObject(source, maxBytes);
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
  if (declared > maxBytes) { await response.body?.cancel(); throw new Error("图片超出当前读取大小限制"); }
  const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let length = 0;
  if (reader) try {
    for (;;) { const item = await reader.read(); if (item.done) break; length += item.value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error("图片超出当前读取大小限制"); } chunks.push(item.value); }
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(chunks);
  return {
    buffer,
    mimeType: response.headers.get("content-type") || mimeFromPath(source),
  };
}
