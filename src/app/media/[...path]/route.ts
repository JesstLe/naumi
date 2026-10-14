import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "path";
import { fetchStoredObject, MEDIA_DIR, storageDriver, privateMedia, remoteMediaAccess, presignStoredObject } from "@/lib/storage";
import {authenticatedEmail} from "@/lib/request-auth";
import {canReadMedia,getMediaAsset,importLegacyMedia,ensureMediaVariants} from "@/lib/media-assets";

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
  m3u8: "application/vnd.apple.mpegurl",
  mpd: "application/dash+xml",
  m4s: "video/iso.segment",
  ts: "video/mp2t",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  flac: "audio/flac",
  srt: "application/x-subrip",
  vtt: "text/vtt",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segs = (await params).path || [];
  // 防目录穿越:段内不允许 .. / 空字节 / 分隔符
  if (
    !segs.length ||
    segs.some(
      (s) => s === ".." || s.includes("\0") || s.includes("/") || s.includes("\\")
    )
  ) {
    return new Response("Bad request", { status: 400 });
  }

  let rel = segs.join("/"),registeredContentType:string|undefined,remoteVersion:string|undefined,remoteFailure=false,remoteReadable=false;
  if (privateMedia) {
    try {
      const owner=await authenticatedEmail(request);
      if(!await canReadMedia(rel,owner)) return new Response("Not found",{status:owner?404:401,headers:{"cache-control":"no-store"}});
      let asset=await getMediaAsset(rel);
      const variant=new URL(request.url).searchParams.get("variant");
      if(variant==='thumbnail'||variant==='preview') {
        asset ||= await importLegacyMedia(rel,owner||undefined);
        if(asset) asset=await ensureMediaVariants(rel).catch(()=>asset);
        const key=variant==='thumbnail'?asset?.thumbnail_key:asset?.preview_key;
        if(key) {rel=key;asset=await getMediaAsset(key);}
      }
      registeredContentType=asset?.content_type;
      remoteReadable=!!asset?.remote_ready;
      remoteVersion=asset?.remote_ready ? asset.sha256 : undefined;
      const requestedVersion=new URL(request.url).searchParams.get("cacheVersion");
      if(remoteVersion&&requestedVersion&&requestedVersion!==remoteVersion)return new Response("Media changed",{status:409,headers:{"cache-control":"no-store"}});
      // Keep manifest URLs on the authenticated App origin so their relative
      // segment/key references resolve through the same per-file authorization.
      if(remoteMediaAccess==='redirect'&&asset?.remote_ready && storageDriver!=='local'&&!/\.(m3u8|mpd)$/i.test(rel)) {
        const filename=new URL(request.url).searchParams.get('download') || undefined;
        return new Response(null,{status:307,headers:{location:await presignStoredObject('GET',rel,300,undefined,filename),
          'cache-control':filename?'private, no-store':'private, max-age=240','vary':'Cookie, Authorization','referrer-policy':'no-referrer'}});
      }
    } catch {return new Response('Storage unavailable',{status:503,headers:{'cache-control':'no-store'}});}
  }
  if (storageDriver !== "local" && (!privateMedia || remoteMediaAccess === "proxy" && remoteReadable)) {
    try {
      const upstream = await fetchStoredObject(rel, request.headers.get("range") || "");
      if (privateMedia && upstream.status === 404) throw new Error("remote missing; try mirror");
      if (privateMedia && !upstream.ok && upstream.status !== 416) return new Response("Storage unavailable", { status: 503, headers: {"cache-control":"no-store"} });
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
      if(privateMedia){headers.set("cache-control","private, max-age=300");headers.set("vary","Cookie, Authorization");headers.set("x-content-type-options","nosniff");}
      const filename=new URL(request.url).searchParams.get("download");
      if(filename) {headers.set("content-disposition",`attachment; filename="${filename.replace(/[^\w.\-]/g,"_").slice(0,160)}"`);headers.set("cache-control","private, no-store");}
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    } catch {
      if (!privateMedia) return new Response("Storage unavailable", { status: 503 });
      remoteFailure=true;
      // A private local mirror remains usable during a NAS outage.
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
    const expected=new URL(request.url).searchParams.get('cacheVersion');
    if(expected && expected!==(remoteVersion || `local:${info.size}:${info.mtimeMs}`)) return new Response('Media changed',{status:409,headers:{'cache-control':'no-store'}});
    const ext = (rel.split(".").pop() || "").toLowerCase();
    const commonHeaders = {
      "content-type": registeredContentType || TYPES[ext] || "application/octet-stream",
      "cache-control": privateMedia ? "private, max-age=300" : "public, max-age=31536000, immutable",
      ...(privateMedia?{"vary":"Cookie, Authorization","x-content-type-options":"nosniff"}:{}),
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
    return new Response(remoteFailure ? "Storage unavailable" : "Not found", { status: remoteFailure ? 503 : 404, headers: {"cache-control":"no-store"} });
  }
}
