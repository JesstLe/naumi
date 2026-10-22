import 'server-only';
import {NextResponse} from 'next/server';
import {biAuthorize} from '@/lib/bi/access';
import {enterpriseAuthorize} from '@/lib/enterprise/access';
import {teamJson,teamFailure,PRIVATE_HEADERS} from '@/lib/teams/access';
import {creationFiltersSchema} from './creation-contracts';
import {listCreations,creationDetail,creationAsset,type CreationReader} from './creations';
import {enterpriseMediaResponse} from '@/lib/enterprise/media-response';
import {z} from 'zod';
export async function creationReader(request:Request,enterprise:boolean):Promise<CreationReader|NextResponse>{
 if(!enterprise){const auth=await biAuthorize(request);return auth instanceof NextResponse?auth:{platform:true};}
 const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
 const id=new URL(request.url).searchParams.get('tenantId');if(!z.string().uuid().safeParse(id).success)return teamJson({error:'企业参数无效'},400);
 // Platform credentials never turn this endpoint into the full internal projection.
 return {platform:false,actor:{...actor,admin:false},tenantId:id!};
}
export async function creationListRoute(request:Request,enterprise=false){
 try{const reader=await creationReader(request,enterprise);if(reader instanceof NextResponse)return reader;
 const query=Object.fromEntries(new URL(request.url).searchParams);if(query.email&&!query.user)query.user=query.email;
 const parsed=creationFiltersSchema.safeParse(query);if(!parsed.success)return teamJson({error:'创作筛选参数无效'},400);
 return teamJson(await listCreations(reader,parsed.data));}catch(e){return teamFailure(e);}
}
export async function creationDetailRoute(request:Request,id:string,enterprise=false){try{
 const reader=await creationReader(request,enterprise);if(reader instanceof NextResponse)return reader;
 if(!/^cr-[a-f0-9-]{36}$/i.test(id))return teamJson({error:'记录不存在或无权访问'},404);
 return teamJson(await creationDetail(reader,id));}catch(e){return teamFailure(e);}}
export async function creationAssetRoute(request:Request,id:string,assetId:string,enterprise=false){try{
 const reader=await creationReader(request,enterprise);if(reader instanceof NextResponse)return reader;
 const media=await creationAsset(reader,id,assetId);
 if(media.mediaType==='image')return enterpriseMediaResponse(request,media.url);
 if(!['video','audio'].includes(media.mediaType))return teamJson({error:'仅支持查看受控媒体'},422);
 return streamManagedMedia(request,media.url,media.mime||'application/octet-stream');
 }catch(e){return teamFailure(e);}}
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
