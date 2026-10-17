import {connect} from 'node:net';
import {once} from 'node:events';
import {z} from 'zod';
export const scanVerdictSchema=z.strictObject({status:z.enum(['clean','infected','error']),engine:z.string().max(200).nullable(),signature:z.string().max(200).nullable(),reason:z.string().max(100).nullable()});
export type ScanVerdict=z.infer<typeof scanVerdictSchema>;
export type FileScanner=(input:AsyncIterable<Uint8Array>)=>Promise<ScanVerdict>;
export type ScanPolicy={mode:'disabled'}|{mode:'required';key:string;label:string;maxAgeMs:number;scan:FileScanner};
export const clamdConfigSchema=z.strictObject({mode:z.literal('clamd-required'),policyId:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/),host:z.string().regex(/^[a-zA-Z0-9.:_-]{1,253}$/),port:z.number().int().min(1).max(65535),timeoutMs:z.number().int().min(100).max(30000).default(30000),maxAgeHours:z.number().int().min(1).max(168).default(24)});
export type ClamdConfig=z.infer<typeof clamdConfigSchema>;
async function exchange(c:ClamdConfig,command:string,input?:AsyncIterable<Uint8Array>){
 const socket=connect({host:c.host,port:c.port});let buffer=Buffer.alloc(0),finished=false;
 const response=new Promise<string>((resolve,reject)=>{socket.on('data',chunk=>{if(finished)return;buffer=Buffer.concat([buffer,chunk]);if(buffer.length>2048){finished=true;reject(Error('SCAN_PROTOCOL_ERROR'));socket.destroy();return;}const end=buffer.indexOf(0);if(end>=0){finished=true;resolve(buffer.subarray(0,end).toString('utf8').trim());}});socket.on('error',error=>{if(!finished){finished=true;reject(Error(error.message==='SCAN_TIMEOUT'?'SCAN_TIMEOUT':'SCAN_UNAVAILABLE'));}});socket.on('close',()=>{if(!finished){finished=true;reject(Error('SCAN_INCOMPLETE_RESPONSE'));}});});
 response.catch(()=>{});const timeout=setTimeout(()=>socket.destroy(Error('SCAN_TIMEOUT')),c.timeoutMs);
 try{await once(socket,'connect');const write=async(b:Uint8Array|string)=>{if(socket.destroyed)throw Error('SCAN_UNAVAILABLE');if(!socket.write(b))await once(socket,'drain');};await write('z'+command+'\0');if(input){for await(const chunk of input){const header=Buffer.alloc(4);header.writeUInt32BE(chunk.byteLength);await write(header);await write(chunk);}await write(Buffer.alloc(4));}return await response;}finally{clearTimeout(timeout);socket.destroy();}
}
export function createClamdScanner(raw:unknown):FileScanner{const c=clamdConfigSchema.parse(raw);return async input=>{try{
 const before=await exchange(c,'VERSION');if(!/^ClamAV [^\x00-\x1f]{1,190}$/.test(before))throw Error('SCAN_PROTOCOL_ERROR');const result=await exchange(c,'INSTREAM',input),after=await exchange(c,'VERSION');if(before!==after)throw Error('SCAN_ENGINE_CHANGED');
 if(result==='stream: OK')return {status:'clean',engine:before,signature:null,reason:null};const found=/^stream: ([^\x00-\x1f]{1,200}) FOUND$/.exec(result);if(found)return {status:'infected',engine:before,signature:found[1],reason:'SCAN_DETECTED'};throw Error('SCAN_ENGINE_ERROR');
 }catch(e){const code=e instanceof Error&&/^SCAN_[A-Z_]+$/.test(e.message)?e.message:'SCAN_UNAVAILABLE';return {status:'error',engine:null,signature:null,reason:code};}};}
