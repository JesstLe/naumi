import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {z} from 'zod';
import {WorkflowError} from './contracts';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const sourceAssetSchema=z.object({id:hash,name:z.string().max(500),sha256:hash,bytes:z.number().int().min(0).max(1024**3),extension:z.string().max(20)});
export type SourceAsset=z.infer<typeof sourceAssetSchema>;
export function sourceDigest(v:unknown):string{const stable=(v:unknown):string=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}':JSON.stringify(v);return createHash('sha256').update(stable(v)).digest('hex');}
function ensure(v:unknown,code:string,status=503):asserts v{if(!v)throw new WorkflowError(status,code);}
export function rasterPreviewType(head:Buffer){const valid=(w:number,h:number)=>w>0&&h>0&&w<=8192&&h<=8192&&w*h<=16_000_000;
 if(head.length>=24&&head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return valid(head.readUInt32BE(16),head.readUInt32BE(20))?'image/png':null;
 if(head[0]===255&&head[1]===216&&head[2]===255){let p=2;while(p+4<=head.length){if(head[p]!==255)return null;while(head[p]===255)p++;const marker=head[p++];if(marker===0xd9||marker===0xda)return null;if(marker===0x01||marker>=0xd0&&marker<=0xd8)continue;if(p+2>head.length)return null;const size=head.readUInt16BE(p);if(size<2||p+size>head.length)return null;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return size>=8&&valid(head.readUInt16BE(p+5),head.readUInt16BE(p+3))?'image/jpeg':null;p+=size;}}
 return null;
}
/** Caller supplies an authorized immutable reference and must revalidate before bytes leave. */
export async function openSourceFile(root:string|undefined,raw:unknown,download:boolean,revalidate:()=>Promise<void>){
 const parsed=sourceAssetSchema.safeParse(raw);ensure(parsed.success,'SOURCE_FILE_INVALID');const a=parsed.data;ensure(root,'SOURCE_STORAGE_NOT_CONFIGURED');ensure(isAbsolute(root),'SOURCE_ROOT_INVALID');let f;
 try{const rootStat=await lstat(root);ensure(rootStat.isDirectory()&&!rootStat.isSymbolicLink(),'SOURCE_ROOT_INVALID');const canonical=await realpath(root),path=join(canonical,a.sha256),st=await lstat(path);ensure(st.isFile()&&!st.isSymbolicLink()&&resolve(await realpath(path))===resolve(path),'SOURCE_FILE_INVALID');f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));const actual=await f.stat();ensure(actual.isFile()&&actual.size===a.bytes,'SOURCE_FILE_INVALID');const h=createHash('sha256'),head=Buffer.alloc(Math.min(a.bytes,64*1024)),buffer=Buffer.alloc(64*1024);let pos=0;
  for(;;){const {bytesRead}=await f.read(buffer,0,buffer.length,pos);if(!bytesRead)break;if(pos===0)buffer.copy(head,0,0,Math.min(head.length,bytesRead));h.update(buffer.subarray(0,bytesRead));pos+=bytesRead;ensure(pos<=a.bytes,'SOURCE_FILE_INVALID');}ensure(pos===a.bytes&&h.digest('hex')===a.sha256,'SOURCE_FILE_HASH_MISMATCH');await revalidate();
  const png=head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=head[0]===255&&head[1]===216&&head[2]===255,preview=rasterPreviewType(head);if(!download&&(png||jpeg))ensure(a.bytes<=8*1024*1024&&preview,'SOURCE_PREVIEW_UNAVAILABLE',413);const inline=!download&&!!preview,mime=inline?preview!:'application/octet-stream';return {asset:a,stream:f.createReadStream({start:0,autoClose:true}),mime,inline};
 }catch(e){await f?.close();if(e instanceof WorkflowError)throw e;throw new WorkflowError(503,'SOURCE_FILE_UNAVAILABLE');}
}
