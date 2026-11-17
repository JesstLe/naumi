import 'server-only';
import sharp from 'sharp';
import {dataUrlToBytes,isManagedImageUrl} from '@/lib/object-storage/runtime';
import {readManagedObject} from '@/lib/object-storage/managed-read';
import {parseDownloadSource,fetchDownloadSource} from '@/lib/download-source';
import {mediaCacheVersion} from '@/lib/media-cache-version';
import {withMediaPreviewSlot} from './media-preview-budget';
export {MediaPreviewBusy} from './media-preview-budget';

type PreviewSource={url:string;maxBytes?:number};
const maxPreviewBytes=32*1024*1024;
export class MediaPreviewVersionChanged extends Error {}

/** Resolve only authorized sources. Any metadata transaction must end before
 * this function reads storage or decodes image data. */
export function renderMediaPreview<T extends PreviewSource>(request:Request,resolve:()=>Promise<T>,validateCacheVersion=false){
 const signal=request.signal;
 return withMediaPreviewSlot(signal,async()=>{
  const source=await resolve();signal.throwIfAborted();
  const {url}=source,max=Math.min(source.maxBytes??maxPreviewBytes,maxPreviewBytes);
  const target=new URL(request.url),query=target.searchParams,expected=validateCacheVersion?query.get('cacheVersion'):null;
  if(url.length>max*1.4)throw new Error('Image too large');
  if(expected){const version=await mediaCacheVersion(url);signal.throwIfAborted();if(expected!==version)throw new MediaPreviewVersionChanged();}
  const inline=dataUrlToBytes(url);let bytes:Buffer;
  if(inline){if(!/^image\/(png|jpeg|webp|gif|avif)$/.test(inline.contentType))throw new Error('Invalid image');bytes=Buffer.from(inline.bytes);}
  else if(isManagedImageUrl(url))bytes=(await readManagedObject(url,max,signal)).bytes;
  else{
   const upstreamUrl=parseDownloadSource(url,target.origin);
   if(upstreamUrl.origin===target.origin)throw new Error('Unmanaged media');
   const upstream=await fetchDownloadSource(upstreamUrl,AbortSignal.any([signal,AbortSignal.timeout(15000)]));
   if(!upstream.ok||!upstream.body){await upstream.body?.cancel().catch(()=>{});throw new Error('Unavailable media');}
   const reader=upstream.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>max)throw new Error('Image too large');chunks.push(next.value);}}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   bytes=Buffer.concat(chunks);
  }
  signal.throwIfAborted();
  if(bytes.length>max)throw new Error('Image too large');
  const bound=query.get('full')==='1'?2560:480;
  // Native libvips work already dispatched is not instantly cancellable; keep
  // the slot until it returns and discard any output for a disconnected client.
  const image=await sharp(bytes,{limitInputPixels:40000000}).timeout({seconds:15}).rotate()
   .resize({width:bound,height:bound,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
  signal.throwIfAborted();
  return {image,source};
 });
}
