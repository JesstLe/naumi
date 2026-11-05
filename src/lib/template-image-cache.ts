import {normalizeHttpUrl} from "./templates/image-source";
export {remoteTemplateImageSource,templateImageDeliveryUrl} from "./templates/image-source";
import "server-only";

import crypto from "crypto";
import { lookup } from "dns/promises";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import http, { type IncomingMessage } from "http";
import https from "https";
import { isIP } from "net";
import path from "path";
import { isManagedImageUrl, managedObjectExists, MEDIA_DIR } from "@/lib/object-storage/runtime";
import { uploadImage } from "@/lib/media-upload";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const INDEX_DIR = path.join(MEDIA_DIR, "templates", "cache-index");

type ImageType = {
  contentType: string;
  extension: string;
};

export type PersistedTemplateImage = ImageType & {
  source: string;
  cachedUrl: string;
  sha256: string;
  size: number;
};

const inflight = new Map<string, Promise<PersistedTemplateImage>>();

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0];
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(value) || value.startsWith("ff")) return true;
  if (value.startsWith("2001:db8:")) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function resolveSafePublicAddress(
  url: URL
): Promise<{ address: string; family: 4 | 6 }> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持 HTTP(S) 图片地址");
  }
  if (url.username || url.password) throw new Error("图片地址不能包含登录信息");
  const allowedPort =
    !url.port ||
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80");
  if (!allowedPort) throw new Error("图片地址端口不受支持");

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("不允许访问内网图片地址");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("不允许访问内网图片地址");
    return { address: hostname, family: isIP(hostname) as 4 | 6 };
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((x) => isPrivateAddress(x.address))) {
    throw new Error("图片域名未解析到安全的公网地址");
  }
  return addresses[0] as { address: string; family: 4 | 6 };
}

function sniffImageType(bytes: Buffer): ImageType | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 6 &&
    (bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
      bytes.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return { contentType: "image/gif", extension: "gif" };
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(4, 8).toString("ascii") === "ftyp" &&
    ["avif", "avis"].includes(bytes.subarray(8, 12).toString("ascii"))
  ) {
    return { contentType: "image/avif", extension: "avif" };
  }
  return null;
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

async function readLimitedBody(response: IncomingMessage): Promise<Buffer> {
  const declared = Number(headerValue(response.headers["content-length"]));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    throw new Error("模板图片超过 12MB 限制");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of response) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.byteLength;
    if (size > MAX_IMAGE_BYTES) {
      response.destroy();
      throw new Error("模板图片超过 12MB 限制");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function requestImage(url: URL): Promise<IncomingMessage> {
  const resolved = await resolveSafePublicAddress(url);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.get(
      url,
      {
        headers: {
          Accept:
            "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1",
          "User-Agent": "NaumiTemplateCache/1.0",
        },
        // 使用刚刚校验过的地址建立连接，避免校验后再次 DNS 解析造成 rebinding。
        lookup: (_hostname, _options, callback) => {
          if (typeof _options === "object" && _options.all) {
            const allCallback = callback as unknown as (
              error: NodeJS.ErrnoException | null,
              addresses: Array<{ address: string; family: number }>
            ) => void;
            allCallback(null, [resolved]);
          } else {
            callback(null, resolved.address, resolved.family);
          }
        },
      },
      resolve
    );
    request.setTimeout(25_000, () => {
      request.destroy(new Error("取图超时"));
    });
    request.on("error", reject);
  });
}

async function downloadImage(source: string, options?: { allowSvg?: boolean; validate?: (url: string) => unknown }): Promise<{ bytes: Buffer } & ImageType> {
  let current = new URL(source);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    options?.validate?.(current.href);
    const response = await requestImage(current);
    const status = response.statusCode || 0;

    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = headerValue(response.headers.location);
      response.resume();
      if (!location) throw new Error("图片源重定向缺少地址");
      current = new URL(location, current);
      continue;
    }
    if (status < 200 || status >= 300) {
      response.resume();
      throw new Error(`图片源返回 ${status}`);
    }

    const declaredType = headerValue(response.headers["content-type"])
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (
      declaredType &&
      !declaredType.startsWith("image/") &&
      declaredType !== "application/octet-stream"
    ) {
      throw new Error("远程地址返回的不是图片");
    }
    const bytes = await readLimitedBody(response);
    const type = sniffImageType(bytes) || (options?.allowSvg && /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(bytes.toString("utf8")) ? { contentType: "image/svg+xml", extension: "svg" } : null);
    if (!type) throw new Error("仅支持 PNG、JPG、WebP、GIF 或 AVIF 图片");
    return { bytes, ...type };
  }
  throw new Error("图片源重定向次数过多");
}

/** Bounded, DNS-pinned public asset download. SVG is inert data and must be validated before rendering. */
export async function fetchPublicImageBytes(source: string, options?: { allowSvg?: boolean; validate?: (url: string) => unknown }) {
  return downloadImage(source, options);
}

function indexFileFor(source: string): string {
  const hash = crypto.createHash("sha256").update(source).digest("hex");
  return path.join(INDEX_DIR, `${hash}.json`);
}

async function localCachedFileExists(cachedUrl: string): Promise<boolean> {
  return managedObjectExists(cachedUrl);
}

async function readIndex(source: string): Promise<PersistedTemplateImage | null> {
  try {
    const parsed = JSON.parse(await readFile(indexFileFor(source), "utf8")) as
      | PersistedTemplateImage
      | undefined;
    if (
      !parsed ||
      parsed.source !== source ||
      !isManagedImageUrl(parsed.cachedUrl) ||
      !(await localCachedFileExists(parsed.cachedUrl))
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeIndex(result: PersistedTemplateImage): Promise<void> {
  await mkdir(INDEX_DIR, { recursive: true });
  const file = indexFileFor(result.source);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(result), "utf8");
  try {
    await rename(tmp, file);
  } catch (error) {
    await unlink(tmp).catch(() => {});
    throw error;
  }
}

async function persist(source: string): Promise<PersistedTemplateImage> {
  const indexed = await readIndex(source);
  if (indexed) return indexed;

  const downloaded = await downloadImage(source);
  const sha256 = crypto.createHash("sha256").update(downloaded.bytes).digest("hex");
  const cachedUrl = await uploadImage(
    new Uint8Array(downloaded.bytes),
    downloaded.contentType,
    `templates/cache/${sha256}.${downloaded.extension}`
  );
  const result: PersistedTemplateImage = {
    source,
    cachedUrl,
    contentType: downloaded.contentType,
    extension: downloaded.extension,
    sha256,
    size: downloaded.bytes.byteLength,
  };
  await writeIndex(result).catch(() => {});
  return result;
}

/** 安全下载远程模板图，以内容 SHA-256 命名并写入当前持久化存储。 */
export async function persistTemplateImage(rawSource: string): Promise<PersistedTemplateImage> {
  const source = normalizeHttpUrl(rawSource);
  if (!source) throw new Error("模板图片 URL 非法");
  if (isManagedImageUrl(source)) {
    throw new Error("模板图片已经由当前实例托管");
  }
  const running = inflight.get(source);
  if (running) return running;

  const promise = persist(source).finally(() => inflight.delete(source));
  inflight.set(source, promise);
  return promise;
}
