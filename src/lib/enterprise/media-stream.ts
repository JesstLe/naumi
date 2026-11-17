import 'server-only';
import { teamJson, PRIVATE_HEADERS } from '@/lib/teams/access';
/** Call only after resolving an authorized, database-owned media reference. */
export async function streamManagedMedia(request:Request,url:string,mime:string){
 const signal=request.signal,cancelled=()=>teamJson({error:'请求已取消'},499);
 if(signal.aborted)return cancelled();
 const {storageKeyFromManagedUrl,storageDriver,fetchStoredObject,MEDIA_DIR}=await import('@/lib/storage');
 const key=storageKeyFromManagedUrl(url);if(!key)return teamJson({error:'素材不可用'},422);
 const headers=new Headers({...PRIVATE_HEADERS,'Content-Security-Policy':"default-src 'none'",'Content-Type':mime,'Accept-Ranges':'bytes'});
 if(storageDriver!=='local'){
  let response:Response;
  try{response=await fetchStoredObject(key,request.headers.get('range')||'',signal);}catch(error){if(signal.aborted)return cancelled();throw error;}
  if(signal.aborted){await response.body?.cancel().catch(()=>{});return cancelled();}
  for(const name of ['content-type','content-range','content-length','accept-ranges'])if(response.headers.has(name))headers.set(name,response.headers.get(name)!);
  return new Response(response.body,{status:response.status,headers});
 }
 const path=await import('node:path'),fs=await import('node:fs'),fsp=await import('node:fs/promises'),{Readable}=await import('node:stream');
 const base=path.resolve(MEDIA_DIR),full=path.resolve(base,key);if(!full.startsWith(base+path.sep))return teamJson({error:'素材不可用'},404);
 try{const info=await fsp.stat(full);signal.throwIfAborted();if(!info.isFile())throw new Error();
 let start=0,end=info.size-1;const raw=request.headers.get('range');
 if(raw){const m=/^bytes=(\d*)-(\d*)$/.exec(raw);if(!m||!m[1]&&!m[2])return new Response(null,{status:416,headers});
 if(!m[1])start=Math.max(0,info.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=info.size){headers.set('content-range',`bytes */${info.size}`);return new Response(null,{status:416,headers});}
 headers.set('content-range',`bytes ${start}-${end}/${info.size}`);}
 headers.set('content-length',String(end-start+1));return new Response(Readable.toWeb(fs.createReadStream(full,{start,end,signal})) as ReadableStream,{status:raw?206:200,headers});
 }catch{return signal.aborted?cancelled():teamJson({error:'素材已失效'},404);}
}
