import 'server-only';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { authenticatedEmail } from '@/lib/request-auth';
import { sameSiteBillingMutation } from '@/lib/billing/access';
import { canReadMedia } from "@/lib/media-assets";
import { getMediaAsset, getMediaAssets } from "@/lib/media-assets-reader";
import { MEDIA_DIR, privateMedia, storageDriver, remoteMediaAccess, presignStoredObject } from "@/lib/object-storage/runtime";
import { managedImageSource, publicImageSource, type BrowserImageDescriptor } from '@/lib/browser-image-source';
import { checkRateLimit } from "@/lib/rate-limit-http";
import {clientIp} from '@/lib/ip';
import {mediaCacheVersion,mediaCacheVersions} from '@/lib/media-cache-version';
import {teamAuthorizePreviewBatch} from '@/lib/teams/access';
import {teamArtwork,teamArtworkPreviewSources} from '@/lib/teams/server';
import {enterpriseAuthorize} from '@/lib/enterprise/access';
import {enterpriseArtwork,enterpriseArtworkPreviewSources} from '@/lib/enterprise/server';
import {resolveMediaRepresentation} from '@/lib/media/representation';

const headers = {'cache-control':'private, no-store', vary:'Cookie, Authorization', 'x-content-type-options':'nosniff'};
const mime: Record<string,string> = {png:'image/png', jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif'};

async function previewVersions(request:Request,sources:ReadonlyMap<string,string>,origin:string){
  const signal=request.signal;
  type Ref={id:string;email:string;raws:Set<string>};
  type Groups=Map<string,Map<string,Ref>>;
  const enterpriseGroups:Groups=new Map(),teamGroups:Groups=new Map();
  const teamItems:{raw:string;tenant:string;email:string;id:string}[]=[];
  const add=(tenants:Groups,tenant:string,key:string,raw:string,email:string,id:string)=>{
    let group=tenants.get(tenant);if(!group)tenants.set(tenant,group=new Map());
    let ref=group.get(key);if(!ref)group.set(key,ref={id,email,raws:new Set()});
    ref.raws.add(raw);
  };
  for(const [raw,source] of sources){
    const kind=source.startsWith('/api/enterprise/media?')?'enterprise':source.startsWith('/api/team/media?')?'team':null;
    if(!kind)continue;
    const params=new URL(source,origin).searchParams;
    const tenant=params.get(kind==='enterprise'?'enterpriseId':'teamId')!,id=params.get('id')!,email=params.get('email')!;
    if(kind==='team')teamItems.push({raw,tenant,email,id});
    else add(enterpriseGroups,tenant,JSON.stringify([email,id]),raw,email,id);
  }
  const result=new Map<string,string>();
  const authorized=new Map<string,Set<string>>();
  if(!teamItems.length&&!enterpriseGroups.size)return result;
  if(teamItems.length){
    try {
      const admission=await teamAuthorizePreviewBatch(request,teamItems.length);
      if(admission){
        // Distinct raw aliases retain distinct quota hits and audit records.
        for(const {raw,tenant,email,id} of teamItems.slice(0,admission.allowed))add(teamGroups,tenant,raw,raw,email,id);
        await collect(teamGroups, (tenant,refs)=>teamArtworkPreviewSources(admission.actor,tenant,refs,signal),
          (tenant,ref)=>teamArtwork(admission.actor,tenant,ref.email,ref.id,signal));
      }
    }catch{signal.throwIfAborted();}
  }
  if(enterpriseGroups.size){
    const actor=await enterpriseAuthorize(request);
    if(!(actor instanceof Response))await collect(enterpriseGroups, (tenant,refs)=>enterpriseArtworkPreviewSources(actor,tenant,refs,signal),
      (tenant,ref)=>enterpriseArtwork(actor,tenant,ref.email,ref.id,signal));
  }
  async function collect(tenants:Groups,batch:(tenant:string,refs:Ref[])=>Promise<Map<number,string|null>>,
    single:(tenant:string,ref:Ref)=>Promise<{image_url:unknown}>){
    for(const [tenant,group] of tenants){
      signal.throwIfAborted();const refs=[...group.values()];
      try{
        for(const [index,url] of await batch(tenant,refs)){
          signal.throwIfAborted();const ref=refs[index];
          if(url!==null){
            let matches=authorized.get(url);if(!matches)authorized.set(url,matches=new Set());
            for(const raw of ref.raws)matches.add(raw);
            continue;
          }
          // Never keep more than one oversized legacy body in memory.
          try{
            const row=await single(tenant,ref);
            const version=await mediaCacheVersion(String(row.image_url),signal);
            if(version)for(const raw of ref.raws)result.set(raw,version);
          }catch{signal.throwIfAborted();}
        }
      }catch{signal.throwIfAborted();/* Refused groups never expose asset metadata. */}
    }
  }
  try{
    const versions=await mediaCacheVersions([...authorized.keys()],signal);
    for(const [url,version] of versions)for(const source of authorized.get(url)!)result.set(source,version);
  }catch{signal.throwIfAborted();/* Keep unrelated groups and direct media sources readable. */}
  return result;
}

export async function imageCacheManifest(request:Request,publicOnly:boolean){
  const signal=request.signal;
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
    const requested=new Set<string>(body.sources),sources=new Map<string,string>();
    for(const raw of requested){const source=managedImageSource(raw,origin);if(source&&(!publicOnly||publicImageSource(source)))sources.set(raw,source);}
    const assets=await getMediaAssets([...sources.values()].filter(s=>!s.startsWith('/api/')).map(s=>decodeURIComponent(new URL(s,origin).pathname.slice(7))),signal);
    const variants=await getMediaAssets([...assets.values()].flatMap(a=>[a.thumbnail_key,a.preview_key].filter((k):k is string=>!!k)),signal);
    const previewVersion=publicOnly?new Map<string,string>():await previewVersions(request,sources,origin);
    // Bounded batches, no unbounded parallel object reads or model calls.
    for(const raw of requested) {
      signal.throwIfAborted();
      results[raw]=null;
      const source=sources.get(raw);if(!source)continue;
      if(source.startsWith('/api/')){
        try{
          const u=new URL(source,origin),enterprise=u.pathname.includes('/enterprise/');
          const rawVersion=previewVersion.get(raw);
          if(!rawVersion)continue;
          const version=(enterprise?(u.searchParams.get('full')==='1'?'enterprise-full-webp-2560-v1:':'enterprise-thumb-webp-480-v1:'):'preview-webp-1280-v1:')+rawVersion;
          results[raw]={account,source,version,fetchUrl:source+'&cacheVersion='+encodeURIComponent(rawVersion),bytes:0,contentType:'image/webp'};
        }catch{signal.throwIfAborted();/* Preserve per-resource denial without leaking another member's URL. */}
        continue;
      }
      const url=new URL(source,origin),key=decodeURIComponent(url.pathname.slice(7));
      const known=assets.get(key);
      if(privateMedia && !(known?.public||known?.owner===account.toLowerCase()) && !await canReadMedia(key,account)) continue;
      const variant=url.searchParams.get('variant');
      const representation=await resolveMediaRepresentation(key,variant,{asset:known,owner:account,variants,legacyOptional:true});
      const {asset}=representation,resolved=representation.key;
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
    signal.throwIfAborted();return Response.json({account,results},{headers});
  } catch {return signal.aborted?Response.json({error:'请求已取消'},{status:499,headers}):Response.json({error:'素材校验失败'},{status:503,headers});}
}
