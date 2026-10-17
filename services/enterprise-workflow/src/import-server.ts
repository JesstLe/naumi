import { createServer,type IncomingMessage } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { ImportStore } from './import-store';
import { WorkflowError } from './contracts';
import { PeopleStore } from './people-store';
export function createImportServer(store:ImportStore,secret:string){
 if(secret.length<32)throw new Error('IMPORT_TOKEN_REQUIRED');
 const local={enterpriseId:store.enterpriseId,subject:'local-owner'};
 const people=new PeopleStore(store.pool,async(_tx,p)=>p.enterpriseId===local.enterpriseId&&p.subject===local.subject?{...p,permissions:['manage'],workKinds:[]}:null,local);
 const authorized=(req:IncomingMessage)=>{const b=Buffer.from(req.headers.authorization||''),a=Buffer.from('Bearer '+secret);return a.length===b.length&&timingSafeEqual(a,b);};
 return createServer(async(req,res)=>{
  const json=(status:number,data:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
  try{
   if(!authorized(req))return json(401,{error:'AUTH_REQUIRED'});
   const url=new URL(req.url||'/','http://local-import'),source=url.searchParams.get('source')||'';
   if(req.method==='GET'&&url.pathname==='/v1/import/context')return json(200,{batches:await store.batches(),mode:'local-owner',viewer:'本机项目管理员',workflowPromotion:false});
   if(req.method==='GET'&&url.pathname==='/v1/import/rows')return json(200,{rows:await store.data(source),assets:await store.assets(source)});
   if(req.method==='GET'&&url.pathname==='/v1/import/people')return json(200,await people.list(local,source));
   if(req.method==='GET'&&url.pathname==='/v1/import/people-audit')return json(200,await people.audit(local));
   if(req.method==='POST'&&['/v1/import/people-profile','/v1/import/people-preview','/v1/import/people-apply'].includes(url.pathname)){
    if(!req.headers['content-type']?.startsWith('application/json'))throw new WorkflowError(415,'JSON_REQUIRED');let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>256*1024)throw new WorkflowError(413,'BODY_TOO_LARGE');chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new WorkflowError(400,'INVALID_JSON');}
    return json(200,await (url.pathname.endsWith('people-profile')?people.profile(local,body):url.pathname.endsWith('people-preview')?people.preview(local,body):people.apply(local,body)));
   }
   if(req.method==='GET'&&url.pathname==='/v1/import/asset'){
    const a=(await store.assets(source)).find(a=>a.id===url.searchParams.get('id'));if(!a)throw new WorkflowError(404,'ASSET_NOT_FOUND');
    const inline=['.png','.jpg','.jpeg'].includes(a.extension)&&url.searchParams.get('download')!=='1',thumb=inline&&url.searchParams.get('thumb')==='1';
    const path=thumb?join(store.blobRoot,'..','thumbs',a.sha256+'.png'):join(store.blobRoot,a.sha256);let size=a.bytes;
    if(thumb){try{size=(await stat(path)).size;}catch{throw new WorkflowError(404,'THUMBNAIL_UNAVAILABLE');}}
    res.writeHead(200,{'content-type':inline?(thumb||a.extension==='.png'?'image/png':'image/jpeg'):'application/octet-stream','content-length':size,'content-disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(a.name).replaceAll("'",'%27')}`,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"});
    const stream=createReadStream(path);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
   }
   if(req.method==='POST'&&url.pathname==='/v1/import/resolve'){
    if(!req.headers['content-type']?.startsWith('application/json'))throw new WorkflowError(415,'JSON_REQUIRED');let size=0;const chunks:Buffer[]=[];
    for await(const chunk of req){size+=chunk.length;if(size>8192)throw new WorkflowError(413,'BODY_TOO_LARGE');chunks.push(chunk);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new WorkflowError(400,'INVALID_JSON');}
    return json(200,await store.resolve(source,body,'local-owner'));
   }
   return json(404,{error:'NOT_FOUND'});
  }catch(e){json(e instanceof WorkflowError?e.status:e instanceof ZodError?400:500,{error:e instanceof WorkflowError?e.code:e instanceof ZodError?'INVALID_INPUT':'IMPORT_SERVICE_ERROR'});}
 });
}
