import { stat } from 'node:fs/promises';
import path from 'node:path';
import { authenticatedEmail } from '@/lib/request-auth';
import { sameSiteBillingMutation } from '@/lib/billing/access';
import { canReadMedia, getMediaAsset, ensureMediaVariants } from '@/lib/media-assets';
import { MEDIA_DIR, privateMedia, storageDriver, presignStoredObject } from '@/lib/storage';
import { managedImageSource, type BrowserImageDescriptor } from '@/lib/browser-image-source';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs', dynamic = 'force-dynamic';
const headers = {'cache-control':'private, no-store', vary:'Cookie, Authorization', 'x-content-type-options':'nosniff'};
const mime: Record<string,string> = {png:'image/png', jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif'};
export async function POST(request: Request) {
  try {
    if (!sameSiteBillingMutation(request)) return Response.json({error:'请求来源无效'}, {status:403,headers});
    const account = await authenticatedEmail(request);
    if (!account) return Response.json({error:'请先登录'}, {status:401,headers});
    if (!rateLimit('image-cache:'+account, 240, 60000)) return Response.json({error:'操作频繁'}, {status:429,headers});
    const reader=request.body?.getReader(); if(!reader) return Response.json({error:'参数无效'},{status:400,headers});
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();return Response.json({error:'参数过大'},{status:413,headers});}chunks.push(part.value);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!Array.isArray(body.sources)||!body.sources.length||body.sources.length>64||body.sources.some((s:unknown)=>typeof s!=='string'||s.length>2048)) return Response.json({error:'参数无效'},{status:400,headers});
    const origin=new URL(request.url).origin;
    const results: Record<string, BrowserImageDescriptor | null> = {};
    // Bounded batches, no unbounded parallel object reads or model calls.
    for(const raw of new Set<string>(body.sources)) {
      results[raw]=null;
      const source=managedImageSource(raw,origin);if(!source)continue;
      const url=new URL(source,origin),key=decodeURIComponent(url.pathname.slice(7));
      if(privateMedia && !await canReadMedia(key,account)) continue;
      let asset=await getMediaAsset(key), resolved=key;
      const variant=url.searchParams.get('variant');
      if(asset && (variant==='thumbnail'||variant==='preview')) {
        asset=await ensureMediaVariants(key).catch(()=>asset);
        const variantKey=variant==='thumbnail'?asset?.thumbnail_key:asset?.preview_key;
        if(variantKey){resolved=variantKey;asset=await getMediaAsset(resolved);}
      }
      const contentType=asset?.content_type||mime[resolved.split('.').pop()?.toLowerCase()||''];
      if(!contentType || !/^image\/(png|jpeg|webp|avif|gif)$/.test(contentType))continue;
      let version=asset?.sha256,bytes=Number(asset?.bytes);
      let fetchUrl=source;
      if(asset?.remote_ready && storageDriver!=='local') fetchUrl=await presignStoredObject('GET',resolved,300);
      else {
        const base=path.resolve(MEDIA_DIR),full=path.resolve(base,resolved);
        if(!full.startsWith(base+path.sep))continue;
        try {const file=await stat(full);if(!file.isFile())continue;bytes=file.size;version=`local:${file.size}:${file.mtimeMs}`;fetchUrl+=(fetchUrl.includes('?')?'&':'?')+'cacheVersion='+encodeURIComponent(version);}catch{continue;}
      }
      if(!version || !Number.isSafeInteger(bytes)||bytes<=0)continue;
      results[raw]={account,source,version,fetchUrl,bytes,contentType};
    }
    return Response.json({account,results},{headers});
  } catch {return Response.json({error:'素材校验失败'},{status:503,headers});}
}
