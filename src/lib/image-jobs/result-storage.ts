import "server-only";
import {createHash} from "node:crypto";
import {safeKey,storageDriver,privateMedia,writeStoredObject,local,readLocalMirror,storageKeyFromManagedUrl} from "../object-storage/runtime";
import {readManagedObjectInternal} from "../object-storage/managed-read";
import {registerMediaAsset} from "../media-assets";

/** Internal paid checkpoints never use a public bucket/CDN. On a legacy public
 * remote configuration keep these objects on this site's existing local store.
 * The persisted location survives a later storage configuration change. */
export async function writeImageJobResult(bytes: Buffer, key: string): Promise<"local" | "managed"> {
  const normalized = safeKey(key);
  if (!normalized.startsWith("image-job-results/")) throw new Error("图片任务对象路径非法");
  if (storageDriver !== "local" && !privateMedia) {
    await local.put(normalized, bytes, "application/octet-stream", "private, no-store");
    return "local";
  }
  const result = await writeStoredObject(bytes, "application/octet-stream", normalized);
  // Keep the existing mirror retry catalog, without thumbnails or a public link.
  // Registration failure is surfaced to the codec's durable inline fallback.
  await registerMediaAsset(normalized, bytes, "application/octet-stream", result.remoteReady, undefined, false);
  return storageDriver === "local" ? "local" : "managed";
}

export async function readImageJobResult(url: string, location: "local" | "managed", maxBytes: number, jobId?: string): Promise<Buffer> {
  const key = storageKeyFromManagedUrl(url);
  if (!key?.startsWith("image-job-results/") || !["local", "managed"].includes(location)) throw new Error("图片任务对象引用非法");
  // The mirror worker uses catalog-owned keys without a job ID. Result decoding
  // supplies its job ID and must pass this check before any local/remote read.
  if (jobId !== undefined && key.split("/")[1] !== createHash("sha256").update(jobId).digest("hex")) throw new Error("图片任务对象归属不匹配");
  return (location === "local" ? await readLocalMirror(key, maxBytes) : await readManagedObjectInternal(url, maxBytes)).bytes;
}
