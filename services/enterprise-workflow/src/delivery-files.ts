import {constants} from 'node:fs';
import {mkdir,lstat,open,realpath,type FileHandle} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {addAbortSignal} from 'node:stream';
import {WorkflowError,id} from './contracts';
export async function deliveryDirectory(root:string,child:string,create=false){
 if(child!=='.tmp'&&!id.safeParse(child).success)throw new WorkflowError(500,'INVALID_BLOB_KEY');
 try{if(create)await mkdir(root,{recursive:true});const base=await lstat(root);if(!base.isDirectory()||base.isSymbolicLink())throw Error('invalid root');const canonical=await realpath(root),dir=join(canonical,child);if(create)await mkdir(dir,{recursive:false}).catch(e=>{if(e.code!=='EEXIST')throw e;});const s=await lstat(dir);if(!s.isDirectory()||s.isSymbolicLink()||resolve(await realpath(dir))!==resolve(dir))throw Error('invalid directory');return dir;}catch{throw new WorkflowError(409,'ASSET_STORAGE_INVALID');}
}
export async function verifiedDeliveryFile(root:string,enterprise:string,hash:string,bytes:number,signal?:AbortSignal){
 signal?.throwIfAborted();if(!/^[a-f0-9]{64}$/.test(hash))throw new WorkflowError(500,'INVALID_BLOB_KEY');const dir=await deliveryDirectory(root,enterprise);return verifiedPath(join(dir,hash),hash,bytes,signal);
}
export async function verifiedPath(path:string,hash:string,bytes:number,signal?:AbortSignal){let f:FileHandle|undefined;try{
 signal?.throwIfAborted();const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||resolve(await realpath(path))!==resolve(path))throw new WorkflowError(409,'ASSET_STORAGE_INVALID');signal?.throwIfAborted();f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));const st=await f.stat();if(!st.isFile()||st.size!==bytes)throw new WorkflowError(409,'ASSET_CORRUPT');const h=createHash('sha256'),stream=f.createReadStream({start:0,autoClose:false});if(signal)addAbortSignal(signal,stream);for await(const b of stream)h.update(b);signal?.throwIfAborted();if(h.digest('hex')!==hash)throw new WorkflowError(409,'ASSET_CORRUPT');return f;
 }catch(e){await f?.close();signal?.throwIfAborted();if(e instanceof WorkflowError)throw e;throw new WorkflowError(409,'ASSET_UNAVAILABLE');}}
