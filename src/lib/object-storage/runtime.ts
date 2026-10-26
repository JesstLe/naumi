import "server-only";
import {readFile,stat} from "fs/promises";
import path from "path";
import {storageConfiguration} from "./config";
import {createObjectStorage,safeStorageKey} from "./adapter";
import {ORIGINAL_IMAGE_MAX_BYTES} from "../image-upload-policy";
const config = storageConfiguration(process.env);

export const storageDriver: "local" | "r2" | "s3" = config.driver;

export const storageEnabled = config.enabled;

export const privateMedia = config.privateMedia;

export const remoteMediaAccess = config.accessMode;

export const MEDIA_DIR = path.resolve(config.mediaDir);

export const MEDIA_URL_PREFIX = "/media";

export const CACHE_CONTROL = "public, max-age=31536000, immutable";

export const backend = createObjectStorage(config);

const local = createObjectStorage({ ...config, driver: "local", enabled: true });

export const safeKey = safeStorageKey;

export function publicBaseForDriver() { return config.publicBase; }

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

export async function writeStoredObject(bytes: Uint8Array, contentType: string, key: string) {
  const normalized = safeKey(key);
  if (storageDriver === "local") {
    await local.put(normalized, bytes, contentType, "private, max-age=300");
    return { remoteReady: false };
  }
  try {
    await backend.put(normalized, bytes, contentType, "private, max-age=300");
    return { remoteReady: true };
  } catch {
    await local.put(normalized, bytes, contentType, "private, max-age=300").catch(() => {
      throw new Error("对象写入失败");
    });
    return { remoteReady: false };
  }
}

export async function presignStoredObject(method: "GET" | "PUT", key: string, expires = 300, contentType?: string, filename?: string, contentLength?: number) {
  if (!storageEnabled || storageDriver === "local") throw new Error("对象存储未启用");
  if (!Number.isInteger(expires) || expires < 1 || expires > 900) throw new Error("签名有效期非法");
  const headers = new Headers();
  if(contentType)headers.set('content-type',contentType);
  if(contentLength!==undefined) {
    if(!Number.isSafeInteger(contentLength)||contentLength<1||contentLength>ORIGINAL_IMAGE_MAX_BYTES)throw new Error('上传大小无效');
    headers.set('content-length',String(contentLength));
  }
  return backend.presign(method,key,expires,headers,filename);
}

export async function fetchStoredObject(key: string, range = ""): Promise<Response> {
  return backend.get(safeKey(key), range);
}

export async function readLocalMirror(key: string, maxBytes: number): Promise<{ bytes: Buffer; contentType: string; size: number }> {
  const root = path.resolve(MEDIA_DIR);
  const full = path.resolve(root, key.replaceAll("/", path.sep));
  if (full === root || !full.startsWith(root + path.sep)) throw new Error("对象路径非法");
  const info = await stat(full);
  if (!info.isFile()) throw new Error("对象不存在");
  if (info.size > maxBytes) throw new Error("对象超过大小限制");
  return { bytes: await readFile(full), contentType: "application/octet-stream", size: info.size };
}

export async function readPendingStoredObject(key: string, maxBytes: number) {
  return readLocalMirror(safeKey(key),maxBytes);
}

export async function managedObjectExists(url: string): Promise<boolean> {
  const key = storageKeyFromManagedUrl(url);
  if (!key) return false;
  // Only 404/ENOENT means absent; permission and transport failures stay errors.
  return backend.exists(key);
}

export async function deleteImageByUrl(url: string): Promise<boolean> {
  const key = storageKeyFromManagedUrl(url);
  if (!key) return false;
  await backend.delete(key);
  // Delete mirror only after the remote acknowledged success; failures retain it.
  if (privateMedia && storageDriver !== "local") await local.delete(key);
  return true;
}

export function dataUrlToBytes(url: string): { bytes: Uint8Array; contentType: string } | null {
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!match) return null;
  return { contentType: match[1], bytes: new Uint8Array(Buffer.from(match[2], "base64")) };
}
