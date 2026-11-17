import {NextResponse} from 'next/server';
import sharp from 'sharp';
import {teamJson,PRIVATE_HEADERS} from '@/lib/teams/access';
import { dataUrlToBytes, isManagedImageUrl } from "@/lib/object-storage/runtime";
import { readManagedObject } from "@/lib/object-storage/managed-read";
import {parseDownloadSource,fetchDownloadSource} from '@/lib/download-source';
import {mediaCacheVersion} from '@/lib/media-cache-version';
import {MediaPreviewBusy,withMediaPreviewSlot} from './media-preview-budget';
/** Authorization precedes this renderer; never accept an image URL from the browser. */
export async function enterpriseMediaResponse(request:Request,imageUrl:string){
  const signal=request.signal;
  try {
    return await withMediaPreviewSlot(signal,async()=>{
      const max = 32 * 1024 * 1024, url = imageUrl; let bytes: Buffer;
      const target=new URL(request.url),query=target.searchParams,expected=query.get('cacheVersion');
      if(expected){const version=await mediaCacheVersion(url);signal.throwIfAborted();if(expected!==version)return teamJson({error:'素材版本已改变'},409);}
      if (url.length > max * 1.4) throw new Error();
      const inline = dataUrlToBytes(url);
      if (inline) { if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(inline.contentType)) throw new Error(); bytes = Buffer.from(inline.bytes); }
      else if (isManagedImageUrl(url)) bytes = (await readManagedObject(url, max, signal)).bytes;
      else {
        const source = parseDownloadSource(url, target.origin);
        if (source.origin === target.origin) throw new Error();
        const upstream = await fetchDownloadSource(source, AbortSignal.any([signal,AbortSignal.timeout(15000)]));
        if (!upstream.ok || !upstream.body) {await upstream.body?.cancel().catch(()=>{});throw new Error();}
        const reader = upstream.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
        try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > max) throw new Error(); chunks.push(next.value); } }
        finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        bytes = Buffer.concat(chunks);
      }
      signal.throwIfAborted();
      if (bytes.length > max) throw new Error();
      const bound = query.get('full')==='1'?2560:480;
      // libvips work already dispatched is not instantly cancellable. Keep its
      // slot through native completion/timeout, and never publish stale output.
      const output = await sharp(bytes, { limitInputPixels: 40000000 }).timeout({seconds:15}).rotate().resize({ width:bound,height:bound,fit:"inside",withoutEnlargement:true }).webp({ quality: 82 }).toBuffer();
      signal.throwIfAborted();
      return new NextResponse(output, { headers: { ...PRIVATE_HEADERS, "Content-Type": "image/webp", "Content-Security-Policy": "default-src 'none'" } });
    });
  } catch(error) {
    if(signal.aborted)return teamJson({error:'请求已取消'},499);
    if(error instanceof MediaPreviewBusy){const response=teamJson({error:'预览请求较多，请稍后重试'},503);response.headers.set('Retry-After','1');return response;}
    return teamJson({ error: "媒体暂时不可读取" }, 422);
  }
}
