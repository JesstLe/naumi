import "server-only";

import { AwsClient } from "aws4fetch";
import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";

// 图片/视频对象存储。显式 STORAGE_DRIVER 优先；未指定时按 R2、通用 S3、本地盘顺序自动选择。
const r2AccountId = process.env.R2_ACCOUNT_ID ?? "";
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
const r2Bucket = process.env.R2_BUCKET ?? "";
const r2PublicBase = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
const hasR2 = Boolean(r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket && r2PublicBase);

const s3Endpoint = (process.env.S3_ENDPOINT ?? "").replace(/\/$/, "");
const s3Region = process.env.S3_REGION || "us-east-1";
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID ?? "";
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? "";
const s3Bucket = process.env.S3_BUCKET ?? "";
const s3PublicBase = (process.env.S3_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
const s3ForcePathStyle = !/^(0|false|no)$/i.test(process.env.S3_FORCE_PATH_STYLE || "true");
const hasS3 = Boolean(s3Endpoint && s3AccessKeyId && s3SecretAccessKey && s3Bucket);

const envDriver = (process.env.STORAGE_DRIVER ?? "").toLowerCase();
export const storageDriver: "local" | "r2" | "s3" =
  envDriver === "r2" || envDriver === "local" || envDriver === "s3"
    ? (envDriver as "local" | "r2" | "s3")
    : hasR2
      ? "r2"
      : hasS3
        ? "s3"
        : "local";

export const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || "./data/media");
const MEDIA_URL_PREFIX = "/media";
export const storageEnabled =
  storageDriver === "local" ||
  (storageDriver === "r2" && hasR2) ||
  (storageDriver === "s3" && hasS3);

const CACHE_CONTROL = "public, max-age=31536000, immutable";
let remoteClient: AwsClient | null = null;

function getRemoteClient(): AwsClient {
  if (!remoteClient) {
    const r2 = storageDriver === "r2";
    remoteClient = new AwsClient({
      accessKeyId: r2 ? r2AccessKeyId : s3AccessKeyId,
      secretAccessKey: r2 ? r2SecretAccessKey : s3SecretAccessKey,
      region: r2 ? "auto" : s3Region,
      service: "s3",
    });
  }
  return remoteClient;
}

function safeKey(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (!normalized || normalized.includes("\0") || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("非法存储 key");
  }
  return normalized;
}

function encodedKey(key: string): string {
  return safeKey(key).split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function remoteObjectEndpoint(key: string): string {
  const encoded = encodedKey(key);
  if (storageDriver === "r2") {
    return `https://${r2AccountId}.r2.cloudflarestorage.com/${encodeURIComponent(r2Bucket)}/${encoded}`;
  }
  if (storageDriver !== "s3" || !hasS3) throw new Error("S3 存储配置不完整");
  if (s3ForcePathStyle) return `${s3Endpoint}/${encodeURIComponent(s3Bucket)}/${encoded}`;
  const endpoint = new URL(s3Endpoint);
  endpoint.hostname = `${s3Bucket}.${endpoint.hostname}`;
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${encoded}`;
  return endpoint.toString();
}

function publicBaseForDriver(): string {
  if (storageDriver === "r2") return r2PublicBase;
  if (storageDriver === "s3") return s3PublicBase;
  return "";
}

export function storageKeyFromManagedUrl(url: string): string | null {
  const value = (url || "").trim().split("?", 1)[0];
  if (value.startsWith(`${MEDIA_URL_PREFIX}/`) && !value.startsWith("//")) {
    try { return safeKey(decodeURIComponent(value.slice(MEDIA_URL_PREFIX.length + 1))); } catch { return null; }
  }
  const publicBase = publicBaseForDriver();
  if (publicBase && value.startsWith(`${publicBase}/`)) {
    try { return safeKey(decodeURIComponent(value.slice(publicBase.length + 1))); } catch { return null; }
  }
  return null;
}

export function isManagedImageUrl(url: string): boolean {
  return storageKeyFromManagedUrl(url) !== null;
}

async function remoteFetch(key: string, init: RequestInit & { method: string }): Promise<Response> {
  if (!storageEnabled || storageDriver === "local") throw new Error("对象存储未启用");
  return getRemoteClient().fetch(remoteObjectEndpoint(key), init);
}

export async function uploadImage(
  bytes: Uint8Array,
  contentType: string,
  key: string,
  cacheControl: string = CACHE_CONTROL
): Promise<string> {
  const normalized = safeKey(key);
  if (storageDriver === "local") {
    const full = path.join(MEDIA_DIR, normalized);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, Buffer.from(bytes));
    return `${MEDIA_URL_PREFIX}/${normalized}`;
  }
  const body = Buffer.from(bytes);
  const response = await remoteFetch(normalized, {
    method: "PUT",
    body,
    headers: {
      "content-type": contentType,
      "content-length": String(body.byteLength),
      "cache-control": cacheControl,
    },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const name = storageDriver === "r2" ? "R2" : "S3";
    throw new Error(`${name} 上传失败：${response.status} ${response.statusText}`);
  }
  const publicBase = publicBaseForDriver();
  return publicBase ? `${publicBase}/${normalized}` : `${MEDIA_URL_PREFIX}/${normalized}`;
}

export async function fetchStoredObject(key: string, range = ""): Promise<Response> {
  const headers = new Headers();
  if (range) headers.set("range", range);
  return remoteFetch(safeKey(key), {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(120_000),
  });
}

export async function readManagedObject(
  url: string,
  maxBytes = Number.POSITIVE_INFINITY
): Promise<{ bytes: Buffer; contentType: string; size: number }> {
  const key = storageKeyFromManagedUrl(url);
  if (!key) throw new Error("对象地址不属于当前存储");
  if (storageDriver === "local") {
    const root = path.resolve(MEDIA_DIR);
    const full = path.resolve(root, key.replaceAll("/", path.sep));
    if (full === root || !full.startsWith(root + path.sep)) throw new Error("对象路径非法");
    const info = await stat(full);
    if (!info.isFile()) throw new Error("对象不存在");
    if (info.size > maxBytes) throw new Error("对象超过大小限制");
    return { bytes: await readFile(full), contentType: "application/octet-stream", size: info.size };
  }
  const response = await fetchStoredObject(key);
  if (!response.ok) throw new Error(`读取对象失败 (${response.status})`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("对象超过大小限制");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("对象超过大小限制");
  return { bytes, contentType: response.headers.get("content-type") || "application/octet-stream", size: bytes.byteLength };
}

export async function managedObjectExists(url: string): Promise<boolean> {
  const key = storageKeyFromManagedUrl(url);
  if (!key) return false;
  if (storageDriver === "local") {
    try {
      const root = path.resolve(MEDIA_DIR);
      const full = path.resolve(root, key.replaceAll("/", path.sep));
      return full !== root && full.startsWith(root + path.sep) && (await stat(full)).isFile();
    } catch { return false; }
  }
  try {
    const response = await remoteFetch(key, { method: "HEAD", signal: AbortSignal.timeout(30_000) });
    return response.ok;
  } catch { return false; }
}

export async function deleteImageByUrl(url: string): Promise<boolean> {
  const key = storageKeyFromManagedUrl(url);
  if (!key) return false;
  if (storageDriver === "local") {
    try { await unlink(path.join(MEDIA_DIR, key)); return true; } catch { return false; }
  }
  try {
    const response = await remoteFetch(key, { method: "DELETE", signal: AbortSignal.timeout(30_000) });
    return response.ok || response.status === 404;
  } catch { return false; }
}

export function dataUrlToBytes(url: string): { bytes: Uint8Array; contentType: string } | null {
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!match) return null;
  return { contentType: match[1], bytes: new Uint8Array(Buffer.from(match[2], "base64")) };
}
