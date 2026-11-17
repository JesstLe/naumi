import "server-only";
import {createHash} from "node:crypto";
import {storageKeyFromManagedUrl,storageDriver,privateMedia,readLocalMirror,fetchStoredObject,hasVerifiedStoredMirror} from "./runtime";
export async function readManagedObject(
  url: string,
  maxBytes = Number.POSITIVE_INFINITY,
  signal?: AbortSignal
): Promise<{ bytes: Buffer; contentType: string; size: number }> {
  if (storageKeyFromManagedUrl(url)?.toLowerCase().startsWith("image-job-results/")) throw new Error("图片任务结果仅供内部恢复读取");
  return readManagedObjectInternal(url,maxBytes,signal);
}

/** Internal storage reader; caller must authorize paid checkpoint identity. */
export async function readManagedObjectInternal(url:string,maxBytes=Number.POSITIVE_INFINITY,signal?:AbortSignal):Promise<{bytes:Buffer;contentType:string;size:number}>{
  signal?.throwIfAborted();
  const key = storageKeyFromManagedUrl(url);
  if (!key) throw new Error("对象地址不属于当前存储");
  if (storageDriver !== "local") {
    if (privateMedia) {
      const {getMediaAsset}=await import('../media-assets-reader');
      signal?.throwIfAborted();
      const asset=await getMediaAsset(key);
      signal?.throwIfAborted();
      if(await hasVerifiedStoredMirror(key,asset,signal)){
        // A NAS-acknowledged local copy may be evicted between check and read.
        try{const saved=await readLocalMirror(key,maxBytes,signal);return {...saved,contentType:asset!.content_type||saved.contentType};}
        catch(error){if((error as NodeJS.ErrnoException)?.code!=='ENOENT'||!asset?.remote_ready)throw error;}
      }
      // A pending upload has not been acknowledged by the remote store. Its
      // durable mirror must be usable immediately, including as a model input.
      if(asset && !asset.remote_ready) {
        try {
          const saved=await readLocalMirror(key,maxBytes,signal);
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
    try { response = await fetchStoredObject(key,'',signal); } catch (error) { remoteError = error; }
    if (response && response.ok) {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        signal?.throwIfAborted();
        const declared = Number(response.headers.get("content-length") || 0);
        if (declared > maxBytes) throw new Error("对象超过大小限制");
        reader = response.body?.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        if (!reader) throw new Error("对象内容为空");
        for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength;
          if (size > maxBytes) throw new Error("对象超过大小限制"); chunks.push(next.value); }
        signal?.throwIfAborted();
        const bytes = Buffer.concat(chunks);
        return { bytes, contentType: response.headers.get("content-type") || "application/octet-stream", size: bytes.byteLength };
      } finally {
        // Header rejection happens before getReader(). It must release the
        // socket too, not leave megabytes queued in every hop of the NAS tunnel.
        if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        else await response.body?.cancel().catch(() => {});
      }
    }
    await response?.body?.cancel().catch(() => {});
    // A disconnected caller is not an outage; don't spend more I/O on fallback.
    signal?.throwIfAborted();
    try {
      return await readLocalMirror(key, maxBytes,signal);
    } catch (localError) {
      const notFound = (localError as NodeJS.ErrnoException)?.code === "ENOENT" || (localError instanceof Error && localError.message === "对象不存在");
      if (!notFound) throw localError;
      if (remoteError) throw remoteError;
      if (response) throw new Error(`读取对象失败 (${response.status})`);
      throw localError;
    }
  }
  return readLocalMirror(key, maxBytes,signal);
}
