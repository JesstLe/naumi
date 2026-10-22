import 'server-only';
import {AwsClient} from 'aws4fetch';
import {createReadStream} from 'node:fs';
import {mkdir,stat,writeFile,unlink} from 'node:fs/promises';
import {Readable} from 'node:stream';
import path from 'node:path';
import type {StorageConfiguration} from './config';
import {WriteAvailability,nasWriteTimeout} from './write-availability';
export interface ObjectStorage {
  put(key:string,bytes:Uint8Array,type:string,cache:string):Promise<void>;
  get(key:string,range?:string):Promise<Response>;
  exists(key:string):Promise<boolean>;
  delete(key:string):Promise<void>;
  presign(method:'GET'|'PUT',key:string,expires:number,headers?:Headers,filename?:string):Promise<string>;
}
export function safeStorageKey(key:string) {
  const normalized=key.replace(/^\/+/, '');
  if(!normalized || normalized.includes('\0') || normalized.includes('\\') || normalized.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('非法存储 key');
  return normalized;
}
export class StorageRequestError extends Error {
  constructor(public status:number,operation:string){super(`存储 ${operation} 失败 (${status})`);}
}
export function createObjectStorage(config:StorageConfiguration):ObjectStorage {
  const full=(key:string)=>{const root=path.resolve(config.mediaDir),file=path.resolve(root,safeStorageKey(key));if(!file.startsWith(root+path.sep))throw new Error('对象路径非法');return file;};
  if(config.driver==='local') return {
    async put(key,bytes){const file=full(key);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,Buffer.from(bytes));},
    async get(key,range=''){
      const file=full(key);let info;try{info=await stat(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return new Response(null,{status:404});throw e;}
      if(!info.isFile())return new Response(null,{status:404});
      const headers=new Headers({'content-length':String(info.size),'accept-ranges':'bytes','content-type':'application/octet-stream'});
      let start=0,end=info.size-1;
      if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range.trim());if(!m||!m[1]&&!m[2]){headers.set('content-range',`bytes */${info.size}`);return new Response(null,{status:416,headers});}
        if(!m[1]){const length=Number(m[2]);start=Math.max(0,info.size-length);if(!length)start=info.size;}else{start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;}
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){headers.set('content-range',`bytes */${info.size}`);return new Response(null,{status:416,headers});}
        headers.set('content-range',`bytes ${start}-${end}/${info.size}`);headers.set('content-length',String(end-start+1));}
      if(!info.size)return new Response(null,{headers});
      return new Response(Readable.toWeb(createReadStream(file,{start,end})) as ReadableStream,{status:range?206:200,headers});
    },
    async exists(key){try{return(await stat(full(key))).isFile();}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}},
    async delete(key){try{await unlink(full(key));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}},
    async presign(){throw new Error('本地存储使用已鉴权 /media 路径');},
  };
  let client:AwsClient|undefined;
  const signer=()=>client ||= new AwsClient({accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey,region:config.region,service:'s3',retries:0});
  const nasWrites = config.driver==='s3' && config.privateMedia && config.accessMode==='proxy' ? new WriteAvailability() : null;
  function endpoint(key:string){if(!config.enabled)throw new Error('对象存储配置不完整');const url=new URL(config.endpoint);const encoded=safeStorageKey(key).split('/').map(encodeURIComponent).join('/');
    if(!config.pathStyle)url.hostname=`${config.bucket}.${url.hostname}`;
    url.pathname=`${url.pathname.replace(/\/$/,'')}/${config.pathStyle?encodeURIComponent(config.bucket)+'/':''}${encoded}`;return url;}
  async function request(key:string,init:RequestInit & {method:string}){
    const signal=init.signal||AbortSignal.timeout(120000);
    const signed=await signer().sign(endpoint(key),{...init,signal});
    // Keep the original cancellation signal on fetch itself, rather than
    // relying only on the signal cloned into the temporary signed Request.
    return fetch(signed,{signal});
  }
  return {
    async put(key,bytes,type,cache){
      if(nasWrites && !await nasWrites.available(async()=>{
        const response=await request(key,{method:'HEAD',signal:AbortSignal.timeout(3000)});
        await response.body?.cancel();
        // The new immutable destination normally does not exist yet.
        if(!response.ok && response.status!==404)throw new StorageRequestError(response.status,'HEAD');
      }))throw new Error('远程存储暂不可用');
      try {
        const response=await request(key,{method:'PUT',body:Buffer.from(bytes),
          ...(nasWrites?{signal:AbortSignal.timeout(nasWriteTimeout(bytes.byteLength))}:{}),
          headers:{'content-type':type,'content-length':String(bytes.byteLength),'cache-control':cache}});
        await response.body?.cancel();
        if(!response.ok)throw new StorageRequestError(response.status,'PUT');
      } catch(error) {nasWrites?.failed();throw error;}
    },
    get(key,range=''){return request(key,{method:'GET',headers:range?{range}:{}});},
    async exists(key){const response=await request(key,{method:'HEAD',signal:AbortSignal.timeout(30000)});if(response.status===404)return false;if(!response.ok)throw new StorageRequestError(response.status,'HEAD');return true;},
    async delete(key){const response=await request(key,{method:'DELETE',signal:AbortSignal.timeout(30000)});if(!response.ok&&response.status!==404)throw new StorageRequestError(response.status,'DELETE');},
    async presign(method,key,expires,headers=new Headers(),filename){if(!Number.isInteger(expires)||expires<1||expires>900)throw new Error('签名有效期非法');const url=endpoint(key);url.searchParams.set('X-Amz-Expires',String(expires));if(filename&&method==='GET')url.searchParams.set('response-content-disposition',`attachment; filename="${filename.replace(/[^\w.\-]/g,'_').slice(0,160)}"`);return(await signer().sign(url,{method,headers,aws:{signQuery:true,allHeaders:headers.has('content-length')}})).url;},
  };
}
