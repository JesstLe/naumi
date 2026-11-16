/** Finite maintenance: catalog-version-fenced NAS delivery, never generation. */
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,readFile,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {safeStorageKey,type ObjectStorage} from '../../src/lib/object-storage/adapter';

export type Item={key:string;sha256:string;bytes:number;content_type:string};
export type Claim=Item&{claim:string};
export type Store={
 claim(item:Item):Promise<Claim|null>;
 publish(item:Claim):Promise<string|null>;
 evict(item:Claim,evictionClaim:string,remove:()=>Promise<boolean>):Promise<boolean>;
 defer(item:Claim):Promise<void>;
};
export type Context={root:string;backend:ObjectStorage;store:Store;log:(row:Record<string,unknown>)=>void;conditionalCreateVerified?:boolean};
export type Outcome={status:string;uploaded?:boolean;bytes?:number};
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const signature=(s:Awaited<ReturnType<typeof lstat>>)=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':');
/** These writers derive the destination from the exact bytes, not a mutable name. */
export function contentAddressed(item:Item){
 const h=item.sha256,k=item.key;
 return new RegExp('^(?:image-job-results/[a-f0-9]{64}/'+h+'\\.bin|image-job-inputs/[^/]+/'+h+'\\.bin|image-delivery/[^/]+/'+h+'\\.[a-z0-9]+|creation-inputs/[^/]+/(?:original|processed)-'+h+'\\.bin|canvas-reference-uploads/[a-f0-9]{40}-'+h+'\\.[a-z0-9]+)$').test(k);
}
async function fileDigest(file:string){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
async function exactRemote(backend:ObjectStorage,item:Item):Promise<'match'|'missing'|'mismatch'>{
 const response=await backend.get(item.key);
 if(response.status===404){await response.body?.cancel();return 'missing';}
 if(response.status!==200||!response.body){await response.body?.cancel();throw Error('REMOTE_GET_FAILED');}
 const hash=createHash('sha256');let bytes=0;
 try{for await(const part of response.body as any){bytes+=part.byteLength;if(bytes>item.bytes){await response.body.cancel().catch(()=>{});return 'mismatch';}hash.update(part);}}
 catch(error){throw Error('REMOTE_READ_FAILED',{cause:error});}
 return bytes===item.bytes&&hash.digest('hex')===item.sha256?'match':'mismatch';
}
export async function backfillOne(expected:Item,ctx:Context):Promise<Outcome>{
 const key=safeStorageKey(expected.key);
 if(key!==expected.key||!/^[a-f0-9]{64}$/.test(expected.sha256)||!Number.isSafeInteger(expected.bytes)||expected.bytes<1||expected.bytes>250*1024*1024)throw Error('INVALID_MANIFEST_ITEM');
 const root=await realpath(ctx.root),file=path.resolve(root,key);
 if(!file.startsWith(root+path.sep))throw Error('KEY_ESCAPE');
 const item=await ctx.store.claim(expected);if(!item)return {status:'superseded-or-claimed'};
 let uploaded=false;
 try{
  let before:Awaited<ReturnType<typeof lstat>>|null=null;
  try{before=await lstat(file);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(before){
   if(!before.isFile()||before.isSymbolicLink()||!(await realpath(file)).startsWith(root+path.sep)||before.size!==item.bytes||await fileDigest(file)!==item.sha256)return {status:'local-mismatch'};
  }
  let remote=await exactRemote(ctx.backend,item);
  if(remote==='mismatch')return {status:'remote-conflict'};
  if(remote==='missing'){
   if(!before)return {status:'missing-both'};
   // Some S3-compatible gateways silently ignore If-None-Match. In that case
   // only audited byte-addressed destinations may be created. Mutable names stay local.
   if(ctx.conditionalCreateVerified!==true&&!contentAddressed(item))return {status:'requires-atomic-create'};
   const bytes=await readFile(file);
   if(bytes.byteLength!==item.bytes||digest(bytes)!==item.sha256||signature(await lstat(file))!==signature(before))return {status:'local-changed'};
   ctx.log({phase:'PUT_INTENT',key,sha256:item.sha256,bytes:item.bytes});
   try{await ctx.backend.put(key,bytes,item.content_type,'private, max-age=300',{ifAbsent:true});uploaded=true;}
   catch(error){if((error as {status?:number}).status!==412)throw error;}
   remote=await exactRemote(ctx.backend,item);
   if(remote!=='match')return {status:'put-readback-mismatch',uploaded};
  }
  ctx.log({phase:'REMOTE_VERIFIED',key,sha256:item.sha256,bytes:item.bytes,uploaded,httpStatus:200});
  const evictionClaim=await ctx.store.publish(item);if(!evictionClaim)return {status:'publish-conflict',uploaded};
  ctx.log({phase:'CATALOG_COMMITTED',key,sha256:item.sha256,bytes:item.bytes});
  if(!before)return {status:'remote-recovered-local-absent',uploaded,bytes:item.bytes};
  const removed=await ctx.store.evict(item,evictionClaim,async()=>{
   const current=await lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
   if(!current||signature(current)!==signature(before!)||await fileDigest(file)!==item.sha256)return false;
   const final=await lstat(file);if(signature(final)!==signature(before!))return false;
   ctx.log({phase:'DELETE_INTENT',key,sha256:item.sha256,bytes:item.bytes});
   await unlink(file);
   ctx.log({phase:'REMOVED',key,sha256:item.sha256,bytes:item.bytes});return true;
  });
  return {status:removed?'evicted':'local-retained-after-publish',uploaded,bytes:item.bytes};
 }finally{await ctx.store.defer(item);}
}
