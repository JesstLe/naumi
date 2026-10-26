import "server-only";
import {createHash} from "node:crypto";
import {storageKeyFromManagedUrl,storageDriver,privateMedia,readLocalMirror,fetchStoredObject} from "./runtime";
export async function readManagedObject(
  url: string,
  maxBytes = Number.POSITIVE_INFINITY
): Promise<{ bytes: Buffer; contentType: string; size: number }> {
  const key = storageKeyFromManagedUrl(url);
  if (!key) throw new Error("对象地址不属于当前存储");
  if (storageDriver !== "local") {
    if (privateMedia) {
      const {getMediaAsset}=await import('../media-assets-reader');
      const asset=await getMediaAsset(key);
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
