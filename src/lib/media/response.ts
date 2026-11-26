import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "path";
import { fetchStoredObject, MEDIA_DIR, storageDriver, privateMedia, remoteMediaAccess, presignStoredObject,hasVerifiedStoredMirror } from "@/lib/object-storage/runtime";
import {authenticatedEmail} from "@/lib/request-auth";
import { canReadMedia } from "@/lib/media-assets";
import {resolveMediaRepresentation} from './representation';

// 本地磁盘存储的图片对外伺服(STORAGE_DRIVER=local 时用)。
// R2/OSS 部署下图片走绝对 CDN URL,不会打到这里 —— 此路由留着无害。

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

export async function serveMedia(request:Request,segs:string[],options:{skipMirror?:boolean}={}) {
  // 防目录穿越:段内不允许 .. / 空字节 / 分隔符
  if (
    !segs.length ||
    segs.some(
      (s) => s === "." || s === ".." || s.includes("\0") || s.includes("/") || s.includes("\\")
    )
  ) {
    return new Response("Bad request", { status: 400 });
  }

  let rel = segs.join("/"),registeredContentType:string|undefined,remoteVersion:string|undefined,remoteFailure=false,remoteReadable=false,remoteMissing=false,verifiedMirror=false;
  if(rel.toLowerCase().startsWith("image-job-results/"))return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});
  const variant=new URL(request.url).searchParams.get('variant');
  // Manifest and byte response must select the same representation even in
  // public-local mode. Private sources still authorize BEFORE reading metadata.
  if (privateMedia || variant==='thumbnail' || variant==='preview') {
    try {
      const owner=privateMedia?await authenticatedEmail(request):null;
      if(privateMedia&&!await canReadMedia(rel,owner)) return new Response("Not found",{status:owner?404:401,headers:{"cache-control":"no-store"}});
      const representation=await resolveMediaRepresentation(rel,variant,{owner:owner||undefined});
      rel=representation.key;const {asset}=representation;
      registeredContentType=asset?.content_type;
      remoteReadable=!!asset?.remote_ready;
      remoteVersion=storageDriver!=="local"&&asset?.remote_ready ? asset.sha256 : undefined;
      const requestedVersion=new URL(request.url).searchParams.get("cacheVersion");
      if(remoteVersion&&requestedVersion&&requestedVersion!==remoteVersion)return new Response("Media changed",{status:409,headers:{"cache-control":"no-store"}});
      verifiedMirror=!options.skipMirror&&privateMedia&&await hasVerifiedStoredMirror(rel,asset);
      // Keep manifest URLs on the authenticated App origin so their relative
      // segment/key references resolve through the same per-file authorization.
      if(privateMedia&&remoteMediaAccess==='redirect'&&asset?.remote_ready && storageDriver!=='local'&&!/\.(m3u8|mpd)$/i.test(rel)) {
        const filename=new URL(request.url).searchParams.get('download') || undefined;
        return new Response(null,{status:307,headers:{location:await presignStoredObject('GET',rel,300,undefined,filename),
          'cache-control':filename?'private, no-store':'private, max-age=240','vary':'Cookie, Authorization','referrer-policy':'no-referrer'}});
      }
    } catch {return new Response('Storage unavailable',{status:503,headers:{'cache-control':'no-store'}});}
  }
  if (!verifiedMirror && storageDriver !== "local" && (!privateMedia || remoteReadable && (remoteMediaAccess === "proxy" || /\.(m3u8|mpd)$/i.test(rel)))) {
    try {
      const remoteRead = new AbortController();
      const upstream = await fetchStoredObject(rel, request.headers.get("range") || "", AbortSignal.any([request.signal, remoteRead.signal]));
      if (privateMedia && !upstream.ok && upstream.status !== 416) {
        remoteMissing = upstream.status === 404;
        // Terminate the NAS request even when middleware retains a cloned body.
        remoteRead.abort();
        void upstream.body?.cancel().catch(() => {});
        throw new Error("remote object unavailable; try mirror");
      }
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
      // Migrated objects may predate object-store MIME metadata. Keep the
      // authenticated catalog type so browser byte-cache/decoders can read them.
      if (!headers.has("content-type") || /^application\/octet-stream(?:;|$)/i.test(headers.get("content-type") || "")) {
        headers.set("content-type", registeredContentType || TYPES[(rel.split(".").pop() || "").toLowerCase()] || "application/octet-stream");
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
      remoteFailure=!remoteMissing;
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
      ...(new URL(request.url).searchParams.get('download') ? {"content-disposition":`attachment; filename="${new URL(request.url).searchParams.get('download')!.replace(/[^\w.\-]/g,'_').slice(0,160)}"`,"cache-control":"private, no-store"} : {}),
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
  } catch (error) {
    // A NAS-acknowledged local copy evicted after the mirror check: serve the NAS original.
    if(verifiedMirror&&remoteReadable&&(error as NodeJS.ErrnoException)?.code==='ENOENT')return serveMedia(request,segs,{skipMirror:true});
    return new Response(remoteFailure ? "Storage unavailable" : "Not found", { status: remoteFailure ? 503 : 404, headers: {"cache-control":"no-store"} });
  }
}
