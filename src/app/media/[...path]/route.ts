import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "path";
import { fetchStoredObject, MEDIA_DIR, storageDriver } from "@/lib/storage";

// 本地磁盘存储的图片对外伺服(STORAGE_DRIVER=local 时用)。
// R2/OSS 部署下图片走绝对 CDN URL,不会打到这里 —— 此路由留着无害。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  mpeg: "video/mpeg",
};

export async function GET(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const segs = params.path || [];
  // 防目录穿越:段内不允许 .. / 空字节 / 分隔符
  if (
    !segs.length ||
    segs.some(
      (s) => s === ".." || s.includes("\0") || s.includes("/") || s.includes("\\")
    )
  ) {
    return new Response("Bad request", { status: 400 });
  }

  const rel = segs.join("/");
  if (storageDriver !== "local") {
    try {
      const upstream = await fetchStoredObject(rel, request.headers.get("range") || "");
      const headers = new Headers();
      for (const name of [
        "accept-ranges",
        "cache-control",
        "content-length",
        "content-range",
        "content-type",
        "etag",
        "last-modified",
      ]) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }
      if (!headers.has("cache-control")) {
        headers.set("cache-control", "public, max-age=31536000, immutable");
      }
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    } catch {
      return new Response("Storage unavailable", { status: 503 });
    }
  }

  const base = path.resolve(MEDIA_DIR);
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const info = await stat(full);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    const ext = (rel.split(".").pop() || "").toLowerCase();
    const commonHeaders = {
      "content-type": TYPES[ext] || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "accept-ranges": "bytes",
    };
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match) {
        return new Response(null, { status: 416, headers: { ...commonHeaders, "content-range": `bytes */${info.size}` } });
      }
      const suffixLength = !match[1] && match[2] ? Number(match[2]) : 0;
      const start = suffixLength ? Math.max(0, info.size - suffixLength) : Number(match[1] || 0);
      const end = suffixLength ? info.size - 1 : Math.min(Number(match[2] || info.size - 1), info.size - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= info.size) {
        return new Response(null, { status: 416, headers: { ...commonHeaders, "content-range": `bytes */${info.size}` } });
      }
      const stream = Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream;
      return new Response(stream, {
        status: 206,
        headers: {
          ...commonHeaders,
          "content-range": `bytes ${start}-${end}/${info.size}`,
          "content-length": String(end - start + 1),
        },
      });
    }
    const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
    return new Response(stream, {
      headers: {
        ...commonHeaders,
        "content-length": String(info.size),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
