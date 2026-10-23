import {SourceWorksheetStore} from './source-worksheet-store';
import {ReferenceStore} from './reference-store';
import { createServer,type IncomingMessage } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { ImportStore } from './import-store';
import { WorkflowError } from './contracts';
import { PeopleStore } from './people-store';
import { WorkflowStore } from './store';
import { id } from './contracts';
import {LocalSourceSnapshot} from './local-source-snapshot';
export function createImportServer(store:ImportStore,secret:string,options:{sourceSnapshotFile?:string;sourceSnapshotRegistry?:{instance:string;enterpriseId:string;enterpriseName:string;origin:string}}={}){
 if(secret.length<32)throw new Error('IMPORT_TOKEN_REQUIRED');
 const local={enterpriseId:store.enterpriseId,subject:'local-owner'};
 const sourceSnapshot=new LocalSourceSnapshot(store.pool,store.enterpriseId,options.sourceSnapshotFile,options.sourceSnapshotRegistry);
 const worksheet=new SourceWorksheetStore(store.pool,async(_tx,p)=>{if(p.enterpriseId!==local.enterpriseId||p.subject!==local.subject)throw new WorkflowError(403,'FORBIDDEN');});
 const people=new PeopleStore(store.pool,async(_tx,p)=>p.enterpriseId===local.enterpriseId&&p.subject===local.subject?{...p,permissions:['manage'],workKinds:[]}:null,local);
 const workflow=new WorkflowStore(store.pool,async(_tx,p)=>p.enterpriseId===local.enterpriseId&&p.subject===local.subject?{...p,permissions:['request','dispatch','manage'],workKinds:[]}:null,async()=>false,local);
 const references=new ReferenceStore(store.pool,async(_tx,p)=>p.enterpriseId===local.enterpriseId&&p.subject===local.subject?{...p,permissions:['request','manage'],workKinds:[]}:null,{[store.enterpriseId]:store.blobRoot});
 const authorized=(req:IncomingMessage)=>{const b=Buffer.from(req.headers.authorization||''),a=Buffer.from('Bearer '+secret);return a.length===b.length&&timingSafeEqual(a,b);};
 return createServer(async(req,res)=>{
  const json=(status:number,data:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
  try{
   if(!authorized(req))return json(401,{error:'AUTH_REQUIRED'});
   const url=new URL(req.url||'/','http://local-import'),source=url.searchParams.get('source')||'';
   if(url.pathname==='/v1/import/source-snapshot'){
    if(req.method!=='GET')throw new WorkflowError(405,'METHOD_NOT_ALLOWED');
    const result=await sourceSnapshot.read(Object.fromEntries(url.searchParams));
    if(result.bytes){res.writeHead(200,{'content-type':result.mime!,'content-length':result.bytes.length,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"});return res.end(result.bytes);}
    return json(200,result.json);
   }
   if(url.pathname.startsWith('/v1/import/worksheet')){
    if(req.method==='GET'&&url.pathname==='/v1/import/worksheet')return json(200,await worksheet.read(local,source));
    if(req.method==='GET'&&url.pathname==='/v1/import/worksheet-audit')return json(200,await worksheet.history(local,source,Number(url.searchParams.get('before')||2147483647)));
    if(req.method==='GET'&&url.pathname==='/v1/import/worksheet-file'){const f=await worksheet.file(local,source,url.searchParams.get('id')||'');const inline=url.searchParams.get('download')!=='1'&&['image/png','image/jpeg'].includes(f.mime);res.writeHead(200,{'content-type':inline?f.mime:'application/octet-stream','content-length':f.bytes,'content-disposition':(inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(f.name).replaceAll("'",'%27'),'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'x-content-sha256':f.id});res.end(f.content);return;}
    if(req.method==='POST'&&['/v1/import/worksheet-command','/v1/import/worksheet-upload'].includes(url.pathname)){
     if(!req.headers['content-type']?.startsWith('application/json'))throw new WorkflowError(415,'JSON_REQUIRED');const chunks:Buffer[]=[];let size=0;for await(const b of req){size+=b.length;if(size>(url.pathname.endsWith('upload')?6*1024*1024:128*1024))throw new WorkflowError(413,'BODY_TOO_LARGE');chunks.push(b);}let input;try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new WorkflowError(400,'INVALID_JSON');}return json(200,url.pathname.endsWith('upload')?await worksheet.upload(local,source,input):await worksheet.execute(local,source,input));
    }
    throw new WorkflowError(405,'METHOD_NOT_ALLOWED');
   }
   if(req.method==='GET'&&url.pathname==='/v1/import/references')return json(200,await references.list(local,id.parse(url.searchParams.get('orderId'))));
   if(req.method==='GET'&&url.pathname==='/v1/import/reference-asset'){
    const {asset,stream,mime,inline}=await references.file(local,id.parse(url.searchParams.get('orderId')),url.searchParams.get('id')||'',url.searchParams.get('download')==='1');if(res.destroyed){stream.destroy();return;}res.writeHead(200,{'content-type':mime,'content-length':asset.bytes,'content-disposition':(inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(asset.name).replaceAll("'",'%27'),'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'x-content-sha256':asset.sha256});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
   }
   if(req.method==='GET'&&url.pathname==='/v1/import/context')return json(200,{batches:await store.batches(),mode:'local-owner',viewer:'本机项目管理员',workflowPromotion:true});
   if(req.method==='GET'&&url.pathname==='/v1/import/rows')return json(200,{rows:await store.data(source),assets:await store.assets(source)});
   if(req.method==='GET'&&url.pathname==='/v1/import/orders')return json(200,await workflow.list(local,Object.fromEntries(['query','status','page'].filter(k=>url.searchParams.has(k)).map(k=>[k,url.searchParams.get(k)]))));
   if(req.method==='GET'&&url.pathname==='/v1/import/order'){const orderId=id.parse(url.searchParams.get('id'));return json(200,await workflow.detail(local,orderId));}
   if(req.method==='POST'&&['/v1/import/intake','/v1/import/command'].includes(url.pathname)){
    if(!req.headers['content-type']?.startsWith('application/json'))throw new WorkflowError(415,'JSON_REQUIRED');let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>128*1024)throw new WorkflowError(413,'BODY_TOO_LARGE');chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new WorkflowError(400,'INVALID_JSON');}
    // Local preparation cannot impersonate employees or publish/execute real work.
    if(url.pathname.endsWith('/command')&&!['create','revise-requirement','submit-requirement','return-requirement','approve-requirement'].includes(body?.action?.type))throw new WorkflowError(403,'LOCAL_PREPARATION_ONLY');
    return json(200,await (url.pathname.endsWith('/intake')?workflow.promote(local,body):workflow.execute(local,body)));
   }
   if(req.method==='GET'&&url.pathname==='/v1/import/people')return json(200,await people.list(local,source));
   if(req.method==='GET'&&url.pathname==='/v1/import/people-audit')return json(200,await people.audit(local));
   if(req.method==='POST'&&['/v1/import/people-roster-preview','/v1/import/people-roster-apply','/v1/import/people-profile','/v1/import/people-preview','/v1/import/people-apply'].includes(url.pathname)){
    if(!req.headers['content-type']?.startsWith('application/json'))throw new WorkflowError(415,'JSON_REQUIRED');let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>256*1024)throw new WorkflowError(413,'BODY_TOO_LARGE');chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new WorkflowError(400,'INVALID_JSON');}
    return json(200,await (url.pathname.endsWith('people-roster-preview')?people.rosterPreview(local,body):url.pathname.endsWith('people-roster-apply')?people.rosterApply(local,body):url.pathname.endsWith('people-profile')?people.profile(local,body):url.pathname.endsWith('people-preview')?people.preview(local,body):people.apply(local,body)));
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
