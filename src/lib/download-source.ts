import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19 || (b===51 && c===100))) ||
      (a===203 && b===0 && c===113));
  }
  return isIP(address) === 6 && /^[23]/i.test(address) && !/^(2001:(0*:|db8:)|2002:|3ffe:|3fff:)/i.test(address);
}

export function allowedDownloadSource(url: URL): boolean {
  if (url.protocol !== "https:" || url.username || url.password) return false;
  for (const base of [process.env.R2_PUBLIC_BASE_URL, process.env.NEXT_PUBLIC_IMAGE_BASE_URL, process.env.S3_PUBLIC_BASE_URL]) {
    try { if (base && url.origin === new URL(base).origin) return true; }
    catch { /* invalid settings do not grant access */ }
  }
  return (!url.port || url.port === "443") && (url.hostname === "images.unsplash.com" || url.hostname.endsWith(".r2.dev"));
}

export function parseDownloadSource(raw: string, origin: string): URL {
  if (/[\\\u0000-\u0020]/.test(raw)) throw new Error("下载地址无效");
  const target = new URL(raw, origin);
  if (target.username || target.password) throw new Error("下载地址无效");
  if (target.origin === origin) {
    if (!target.pathname.startsWith("/media/")) throw new Error("只允许下载媒体文件");
  } else if (raw.startsWith("/")) {
    throw new Error("只允许下载媒体文件");
  } else if (!allowedDownloadSource(target)) throw new Error("不允许的来源");
  return target;
}

/** Validate every redirect and pin DNS to the connection against rebinding. */
export async function fetchDownloadSource(target: URL, signal: AbortSignal, transport = { lookup, request: httpsRequest }): Promise<Response> {
  let url = target;
  for (let hop = 0; hop <= 4; hop++) {
    if (!allowedDownloadSource(url)) throw new Error("不允许的来源");
    const addresses = await transport.lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("不允许访问内网地址");
    const selected = addresses[0];
    const response = await new Promise<Response>((resolve, reject) => {
      const req = transport.request(url, { signal, lookup: (_host, options, callback) => {
        if (options.all) callback(null, [selected]);
        else callback(null, selected.address, selected.family);
      } }, (incoming) => {
        try {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value != null) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        const status = incoming.statusCode || 502;
        resolve(new Response([204, 304].includes(status) ? null : Readable.toWeb(incoming) as ReadableStream, { status, headers }));
        if ([204,304].includes(status)) incoming.resume();
        } catch (error) { incoming.destroy(); reject(error); }
      });
      req.on("error", reject);
      req.end();
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location || hop === 4) throw new Error("下载源重定向无效");
    url = new URL(location, url);
  }
  throw new Error("下载源重定向过多");
}
