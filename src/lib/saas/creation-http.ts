import 'server-only';
import {NextResponse} from 'next/server';
import {tenantAuthorize} from './tenants';
import {enterpriseAuthorize} from '@/lib/enterprise/access';
import {teamJson,PRIVATE_HEADERS} from '@/lib/teams/access';
import {TeamError} from '@/lib/teams/server';
import {creationFiltersSchema} from './creation-contracts';
import {listCreations,creationDetail,creationAsset,type CreationReader} from './creations';
import {enterpriseMediaResponse} from '@/lib/enterprise/media-response';
import {z} from 'zod';
import {listLegacyCreations,legacyCreationDetail,legacyCreationAsset} from './legacy-creations';
import {creationPlaybackToken,readCreationPlaybackToken,platformPlaybackToken,platformPlaybackAllowed} from './creation-playback';
import {userFeaturePolicy} from "@/lib/feature-access/repository";
import {allows} from '@/lib/feature-access/catalog';
function creationFailure(error:unknown){return error instanceof TeamError?teamJson({error:error.message,code:`CREATION_${error.status}`},error.status):teamJson({error:'创作证据暂不可读取，请重试',code:'CREATION_UNAVAILABLE'},503);}
export async function creationReader(request:Request,enterprise:boolean):Promise<CreationReader|NextResponse>{
 if(!enterprise){const auth=await tenantAuthorize(request);return auth instanceof NextResponse?auth:{platform:true};}
 const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
 const id=new URL(request.url).searchParams.get('tenantId');if(!z.string().uuid().safeParse(id).success)return teamJson({error:'企业参数无效'},400);
 // Platform credentials never turn this endpoint into the full internal projection.
 return {platform:false,actor:{...actor,admin:false},tenantId:id!};
}
export async function creationListRoute(request:Request,enterprise=false){
 try{const reader=await creationReader(request,enterprise);if(reader instanceof NextResponse)return reader;
 const query=Object.fromEntries(new URL(request.url).searchParams);if(query.email&&!query.user)query.user=query.email;
 if(query.source==='legacy'&&!query.from&&!query.to&&!query.period)query.period='all';
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);if(!query.from&&!query.to&&query.period!=='all'){query.to=today;query.from=new Date(Date.parse(today)-6*86400000).toISOString().slice(0,10);}
 const parsed=creationFiltersSchema.safeParse(query);if(!parsed.success)return teamJson({error:'创作筛选参数无效'},400);
 if(parsed.data.source==='legacy'){if(!reader.platform||parsed.data.tenantId)return teamJson({error:'历史归属未确认，请使用受授权的成员历史入口'},400);return teamJson(await listLegacyCreations(parsed.data));}
 return teamJson(await listCreations(reader,parsed.data));}catch(e){return creationFailure(e);}
}
export async function creationDetailRoute(request:Request,id:string,enterprise=false){try{
 const reader=await creationReader(request,enterprise);if(reader instanceof NextResponse)return reader;
 if(id.startsWith('legacy-')&&reader.platform){const page=Number(new URL(request.url).searchParams.get('assetPage')||1);if(!Number.isSafeInteger(page)||page<1||page>100000)return teamJson({error:'详情分页参数无效'},400);return teamJson((await legacyCreationDetail(id,{assetPage:page})).detail);}
 if(!/^cr-[a-f0-9-]{36}$/i.test(id))return teamJson({error:'记录不存在或无权访问'},404);
 const q=new URL(request.url).searchParams,pages=z.object({assetPage:z.coerce.number().int().min(1).max(100000).default(1),eventPage:z.coerce.number().int().min(1).max(100000).default(1),childPage:z.coerce.number().int().min(1).max(100000).default(1)}).safeParse(Object.fromEntries(q));
 if(!pages.success)return teamJson({error:'详情分页参数无效'},400);
 return teamJson(await creationDetail(reader,id,pages.data));}catch(e){return creationFailure(e);}}
export async function creationAssetRoute(request:Request,id:string,assetId:string,enterprise=false){try{
 const query=new URL(request.url).searchParams,token=query.get('mediaToken');
 const grant=token?readCreationPlaybackToken(token,id,assetId,query.get('tenantId')):null;
 if(token&&!grant)return teamJson({error:'播放授权已失效，请重新读取素材'},401);
 if(grant&&(enterprise!==(grant.mode==='tenant')))return teamJson({error:'播放授权无效'},403);
 if(grant?.mode==='tenant'&&!allows(await userFeaturePolicy(grant.email),'team'))return teamJson({error:'企业管理功能尚未授权'},403);
 if(grant?.mode==='platform'&&!await platformPlaybackAllowed(grant))return teamJson({error:'平台播放授权已失效'},403);
 const reader:CreationReader|NextResponse=grant?grant.mode==='platform'?{platform:true}:{platform:false,actor:{email:grant.email,admin:false,consoleAdmin:false},tenantId:grant.tenantId}:await creationReader(request,enterprise);if(reader instanceof NextResponse)return reader;
 const media=id.startsWith('legacy-')&&reader.platform?await legacyCreationAsset(id,assetId):await creationAsset(reader,id,assetId);
 if(media.mediaType==='image')return enterpriseMediaResponse(request,media.url);
 if(!['video','audio'].includes(media.mediaType))return teamJson({error:'仅支持查看受控媒体'},422);
 if(query.get('playback')==='1'&&!grant){const url=new URL(request.url);url.searchParams.delete('playback');url.searchParams.set('mediaToken',reader.platform?await platformPlaybackToken(request,id,assetId):creationPlaybackToken(reader.actor.email,reader.tenantId,id,assetId));return teamJson({url:url.pathname+url.search});}
 return streamManagedMedia(request,media.url,media.mime||'application/octet-stream');
 }catch(e){return creationFailure(e);}}
async function streamManagedMedia(request:Request,url:string,mime:string){
 const {storageKeyFromManagedUrl,storageDriver,fetchStoredObject,MEDIA_DIR}=await import('@/lib/storage');
 const key=storageKeyFromManagedUrl(url);if(!key)return teamJson({error:'素材不可用'},422);
 const headers=new Headers({...PRIVATE_HEADERS,'Content-Security-Policy':"default-src 'none'",'Content-Type':mime,'Accept-Ranges':'bytes'});
 if(storageDriver!=='local'){
  const response=await fetchStoredObject(key,request.headers.get('range')||'');
  for(const name of ['content-type','content-range','content-length','accept-ranges'])if(response.headers.has(name))headers.set(name,response.headers.get(name)!);
  return new Response(response.body,{status:response.status,headers});
 }
 const path=await import('node:path'),fs=await import('node:fs'),fsp=await import('node:fs/promises'),{Readable}=await import('node:stream');
 const base=path.resolve(MEDIA_DIR),full=path.resolve(base,key);if(!full.startsWith(base+path.sep))return teamJson({error:'素材不可用'},404);
 try{const info=await fsp.stat(full);if(!info.isFile())throw new Error();
 let start=0,end=info.size-1;const raw=request.headers.get('range');
 if(raw){const m=/^bytes=(\d*)-(\d*)$/.exec(raw);if(!m||!m[1]&&!m[2])return new Response(null,{status:416,headers});
 if(!m[1])start=Math.max(0,info.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=info.size){headers.set('content-range',`bytes */${info.size}`);return new Response(null,{status:416,headers});}
 headers.set('content-range',`bytes ${start}-${end}/${info.size}`);}
 headers.set('content-length',String(end-start+1));return new Response(Readable.toWeb(fs.createReadStream(full,{start,end})) as ReadableStream,{status:raw?206:200,headers});
 }catch{return teamJson({error:'素材已失效'},404);}
}
