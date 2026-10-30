import 'server-only';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { authenticatedEmail } from '@/lib/request-auth';
import { sameSiteBillingMutation } from '@/lib/billing/access';
import { canReadMedia, ensureMediaVariants, importLegacyMedia } from "@/lib/media-assets";
import { getMediaAsset, getMediaAssets } from "@/lib/media-assets-reader";
import { MEDIA_DIR, privateMedia, storageDriver, remoteMediaAccess, presignStoredObject } from "@/lib/object-storage/runtime";
import { managedImageSource, publicImageSource, type BrowserImageDescriptor } from '@/lib/browser-image-source';
import { checkRateLimit } from "@/lib/rate-limit-http";
import {clientIp} from '@/lib/ip';
import {mediaCacheVersion} from '@/lib/media-cache-version';
import {teamAuthorize} from '@/lib/teams/access';
import {teamArtwork} from '@/lib/teams/server';
import {enterpriseAuthorize} from '@/lib/enterprise/access';
import {enterpriseArtwork} from '@/lib/enterprise/server';

const headers = {'cache-control':'private, no-store', vary:'Cookie, Authorization', 'x-content-type-options':'nosniff'};
const mime: Record<string,string> = {png:'image/png', jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif'};
export async function imageCacheManifest(request:Request,publicOnly:boolean){
  try {
    if (!sameSiteBillingMutation(request)) return Response.json({error:'请求来源无效'}, {status:403,headers});
    const account = publicOnly?'public':await authenticatedEmail(request);
    if (!account) return Response.json({error:'请先登录'}, {status:401,headers});
    const rateLimitResult = await checkRateLimit('image-cache:'+(publicOnly?'public:'+clientIp(request):account), 240, 60000);
    if (rateLimitResult instanceof Response) return rateLimitResult;
    if (!rateLimitResult) return Response.json({error:'操作频繁'}, {status:429,headers});
    const reader=request.body?.getReader(); if(!reader) return Response.json({error:'参数无效'},{status:400,headers});
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();return Response.json({error:'参数过大'},{status:413,headers});}chunks.push(part.value);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!Array.isArray(body.sources)||!body.sources.length||body.sources.length>64||body.sources.some((s:unknown)=>typeof s!=='string'||s.length>2048)) return Response.json({error:'参数无效'},{status:400,headers});
    const origin=new URL(request.url).origin;
    const results: Record<string, BrowserImageDescriptor | null> = {};
    // Request-local owned metadata is bulk-read; shared/legacy references retain
    // their full authoritative per-resource authorization path.
    const sources=new Map<string,string>();
    for(const raw of new Set<string>(body.sources)){const source=managedImageSource(raw,origin);if(source&&!source.startsWith('/api/')&&(!publicOnly||publicImageSource(source)))sources.set(raw,source);}
    const assets=await getMediaAssets([...sources.values()].map(s=>decodeURIComponent(new URL(s,origin).pathname.slice(7))));
    const variants=await getMediaAssets([...assets.values()].flatMap(a=>[a.thumbnail_key,a.preview_key].filter((k):k is string=>!!k)));
    // Bounded batches, no unbounded parallel object reads or model calls.
    for(const raw of new Set<string>(body.sources)) {
      results[raw]=null;
      const source=managedImageSource(raw,origin);if(!source)continue;
      if(publicOnly&&!publicImageSource(source))continue;
      if(source.startsWith('/api/')){
        try{
          const u=new URL(source,origin),enterprise=u.pathname.includes('/enterprise/');
          const actor=enterprise?await enterpriseAuthorize(request):await teamAuthorize(request);
          if(actor instanceof Response)continue;
          const email=u.searchParams.get('email')!,id=u.searchParams.get('id')!;
          const row=enterprise?await enterpriseArtwork(actor,u.searchParams.get('enterpriseId')!,email,id):await teamArtwork(actor,u.searchParams.get('teamId')!,email,id);
          const rawVersion=await mediaCacheVersion(String(row.image_url));if(!rawVersion)continue;
          const version=(enterprise?(u.searchParams.get('full')==='1'?'enterprise-full-webp-2560-v1:':'enterprise-thumb-webp-480-v1:'):'preview-webp-1280-v1:')+rawVersion;
          results[raw]={account,source,version,fetchUrl:source+'&cacheVersion='+encodeURIComponent(rawVersion),bytes:0,contentType:'image/webp'};
        }catch{/* Preserve per-resource denial without leaking another member's URL. */}
        continue;
      }
      const url=new URL(source,origin),key=decodeURIComponent(url.pathname.slice(7));
      const known=assets.get(key);
      if(privateMedia && !(known?.public||known?.owner===account.toLowerCase()) && !await canReadMedia(key,account)) continue;
      let asset=known||await getMediaAsset(key), resolved=key;
      const variant=url.searchParams.get('variant');
      if(variant==='thumbnail'||variant==='preview') {
        asset ||= await importLegacyMedia(key,account).catch(()=>null);
        if(asset&&!(asset.thumbnail_key&&asset.preview_key))asset=await ensureMediaVariants(key).catch(()=>asset);
        const variantKey=variant==='thumbnail'?asset?.thumbnail_key:asset?.preview_key;
        if(variantKey){resolved=variantKey;asset=variants.get(resolved)||await getMediaAsset(resolved);}
      }
      const contentType=asset?.content_type||mime[resolved.split('.').pop()?.toLowerCase()||''];
      if(!contentType || !/^image\/(png|jpeg|webp|avif|gif)$/.test(contentType))continue;
      let version=asset?.sha256,bytes=Number(asset?.bytes);
      let fetchUrl=source;
      if(asset?.remote_ready && storageDriver!=='local') { if(remoteMediaAccess==='redirect') fetchUrl=await presignStoredObject('GET',resolved,300); else fetchUrl+=(fetchUrl.includes('?')?'&':'?')+'cacheVersion='+encodeURIComponent(version!); }
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
