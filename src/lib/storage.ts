import "server-only";

import { readFile, stat, statfs, mkdir } from "fs/promises";
import {createReadStream} from 'node:fs';
import path from "path";
import {createHash} from "node:crypto";
import { storageConfiguration } from "./object-storage/config";
import { createObjectStorage, safeStorageKey } from "./object-storage/adapter";
import {ORIGINAL_IMAGE_MAX_BYTES} from "./image-upload-policy";

const config = storageConfiguration(process.env);
export const storageDriver: "local" | "r2" | "s3" = config.driver;
export const storageEnabled = config.enabled;
export const privateMedia = config.privateMedia;
export const remoteMediaAccess = config.accessMode;
export const deferredNasDelivery = process.env.NAUMI_NAS_DEFER_UPLOAD==='1' && config.driver==='s3' && config.privateMedia && config.accessMode==='proxy';
export const MEDIA_DIR = path.resolve(config.mediaDir);
const MEDIA_URL_PREFIX = "/media";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const backend = createObjectStorage(config);
const local = createObjectStorage({ ...config, driver: "local", enabled: true });
const safeKey = safeStorageKey;
function publicBaseForDriver() { return config.publicBase; }

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

export async function uploadImage(
  bytes: Uint8Array,
  contentType: string,
  key: string,
  cacheControl: string = CACHE_CONTROL,
  owner?: string
): Promise<string> {
  if (privateMedia) {
    const result = await writeStoredObject(bytes, contentType, key);
    const { registerMediaAsset } = await import("./media-assets");
    // Registration/preview failure must not discard the mirrored original.
    await registerMediaAsset(key, bytes, contentType, result.remoteReady, owner).catch(() => {});
    return `${MEDIA_URL_PREFIX}/${safeKey(key)}`;
  }
  const normalized = safeKey(key);
  if (storageDriver === "local") {
    await backend.put(normalized, bytes, contentType, cacheControl);
    return `${MEDIA_URL_PREFIX}/${normalized}`;
  }
  await backend.put(normalized, bytes, contentType, cacheControl);
  const publicBase = publicBaseForDriver();
  return publicBase ? `${publicBase}/${normalized}` : `${MEDIA_URL_PREFIX}/${normalized}`;
}

// Remote first: with object storage configured the remote bucket is the
// source of truth, so the app disk stops growing. An object-store outage
// falls back to a local mirror — an already paid result is never discarded,
// and the mirror remains readable by the previous release too.
export async function writeStoredObject(bytes: Uint8Array, contentType: string, key: string) {
  const normalized = safeKey(key);
  if (storageDriver === "local") {
    await local.put(normalized, bytes, contentType, "private, max-age=300");
    return { remoteReady: false };
  }
  // Opt-in NAS delivery: acknowledge durable local bytes, not a remote upload.
  // Catalog remote_ready=false is the existing retry queue. A slow tunnel is
  // no longer part of the paid generation's response time. Keep disk reserve;
  // large video objects and low-space writes retain the remote-first contract.
  if(deferredNasDelivery && bytes.byteLength<=64*1024*1024){
    await mkdir(MEDIA_DIR,{recursive:true});
    const space=await statfs(MEDIA_DIR);
    if(space.bavail*space.bsize>4*1024**3+bytes.byteLength){
      await local.put(normalized,bytes,contentType,'private, max-age=300');
      return {remoteReady:false};
    }
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

/** Recovery uploads the original immutable bytes, bypassing deferred delivery.
 * Never calls a model, creates a generation identity, or touches billing. */
export async function mirrorStoredObject(bytes:Uint8Array,contentType:string,key:string){
  if(storageDriver==='local')return {remoteReady:false};
  await backend.put(safeKey(key),bytes,contentType,'private, max-age=300');
  return {remoteReady:true};
}

type MirrorIdentity={bytes:number|string;sha256:string};
const verifiedMirrors=new Map<string,string>();
export async function hasVerifiedStoredMirror(key:string,asset:MirrorIdentity|null|undefined){
  if(!deferredNasDelivery||!asset)return false;
  const file=path.join(MEDIA_DIR,safeKey(key));
  try{
    const info=await stat(file);if(!info.isFile()||info.size!==Number(asset.bytes))return false;
    const version=`${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}:${asset.sha256}`;
    if(verifiedMirrors.get(file)===version)return true;
    const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
    const after=await stat(file);
    if(after.ino!==info.ino||after.mtimeMs!==info.mtimeMs||after.ctimeMs!==info.ctimeMs||after.size!==info.size||hash.digest('hex')!==asset.sha256)return false;
    if(verifiedMirrors.size>=1024)verifiedMirrors.delete(verifiedMirrors.keys().next().value!);
    verifiedMirrors.set(file,version);return true;
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
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

export async function fetchStoredObject(key: string, range = "", signal?:AbortSignal): Promise<Response> {
  return backend.get(safeKey(key), range,signal);
}

export async function readManagedObject(
  url: string,
  maxBytes = Number.POSITIVE_INFINITY
): Promise<{ bytes: Buffer; contentType: string; size: number }> {
  const key = storageKeyFromManagedUrl(url);
  if (!key) throw new Error("对象地址不属于当前存储");
  if (storageDriver !== "local") {
    if (privateMedia) {
      const {getMediaAsset}=await import('./media-assets');
      const asset=await getMediaAsset(key);
      if(await hasVerifiedStoredMirror(key,asset)){
        const saved=await readLocalMirror(key,maxBytes);return {...saved,contentType:asset!.content_type||saved.contentType};
      }
      // A pending upload has not been acknowledged by the remote store. Its
      // durable mirror must be usable immediately, including as a model input.
      if(asset && !asset.remote_ready) {
        try {
          const saved=await readLocalMirror(key,maxBytes);
          if(saved.size!==Number(asset.bytes)||createHash('sha256').update(saved.bytes).digest('hex')!==asset.sha256)
            throw new Error('本地素材校验失败');
          return {...saved,contentType:asset.content_type||saved.contentType};
        }
        catch(error) {if((error as NodeJS.ErrnoException)?.code!=='ENOENT')throw error;}
      }
    }
    // Remote objects are authoritative; the local mirror covers a remote
    // outage and keys written before (or during) the remote cutover.
    let response: Response | null = null, remoteError: unknown = null;
    try { response = await fetchStoredObject(key); } catch (error) { remoteError = error; }
    if (response && response.ok) {
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > maxBytes) throw new Error("对象超过大小限制");
      const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
      if (!reader) throw new Error("对象内容为空");
      try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength;
        if (size > maxBytes) throw new Error("对象超过大小限制"); chunks.push(next.value); } }
      finally { await reader.cancel().catch(() => {}); }
      const bytes = Buffer.concat(chunks);
      return { bytes, contentType: response.headers.get("content-type") || "application/octet-stream", size: bytes.byteLength };
    }
    try {
      return await readLocalMirror(key, maxBytes);
    } catch (localError) {
      const notFound = (localError as NodeJS.ErrnoException)?.code === "ENOENT" || (localError instanceof Error && localError.message === "对象不存在");
      if (!notFound) throw localError;
      if (remoteError) throw remoteError;
      if (response) throw new Error(`读取对象失败 (${response.status})`);
      throw localError;
    }
  }
  return readLocalMirror(key, maxBytes);
}

async function readLocalMirror(key: string, maxBytes: number): Promise<{ bytes: Buffer; contentType: string; size: number }> {
  const root = path.resolve(MEDIA_DIR);
  const full = path.resolve(root, key.replaceAll("/", path.sep));
  if (full === root || !full.startsWith(root + path.sep)) throw new Error("对象路径非法");
  const info = await stat(full);
  if (!info.isFile()) throw new Error("对象不存在");
  if (info.size > maxBytes) throw new Error("对象超过大小限制");
  return { bytes: await readFile(full), contentType: "application/octet-stream", size: info.size };
}

/** Recovery already owns a pending catalog row; do not wait for the failed
 * remote path before reading the bytes which need to be uploaded to it.
 */
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
  // String slicing instead of a capture-group regex: 2K PNG data URLs reach
  // ~6.5M base64 characters and the regex engine's stack limit (RangeError:
  // stack-limit from RegExp.exec) is exceeded well before that. Buffer.from
  // tolerates invalid base64 characters, so strict charset validation is
  // unnecessary for this transport-only decode.
  const prefix = "data:";
  const marker = ";base64,";
  if (!url.startsWith(prefix)) return null;
  const markerIdx = url.indexOf(marker, prefix.length);
  if (markerIdx === -1) return null;
  const base64 = url.slice(markerIdx + marker.length);
  if (!base64) return null;
  const contentType = url.slice(prefix.length, markerIdx);
  return { contentType, bytes: new Uint8Array(Buffer.from(base64, "base64")) };
}
