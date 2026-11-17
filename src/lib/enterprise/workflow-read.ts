import 'server-only';
import {IntegrationError} from './integration/policy';

export const WORKFLOW_JSON_MAX_BYTES=16*1024*1024;

export function workflowReadSignal(request:Request,timeoutMs:number) {
 return AbortSignal.any([request.signal,AbortSignal.timeout(timeoutMs)]);
}

/** Bound the decoded JSON response, including chunked/decompressed bodies.
 * Binary exports bypass this reader and retain their existing stream policy. */
export async function readWorkflowJson(response:Response,invalidCode='WORKFLOW_RESPONSE_INVALID') {
 const invalid=()=>new IntegrationError(invalidCode,502);
 const oversized=()=>new IntegrationError('WORKFLOW_RESPONSE_TOO_LARGE',502);
 if(!response.headers.get('content-type')?.includes('application/json')||!response.body){
  await response.body?.cancel().catch(()=>{});
  throw invalid();
 }
 if(Number(response.headers.get('content-length'))>WORKFLOW_JSON_MAX_BYTES){
  await response.body.cancel().catch(()=>{});
  throw oversized();
 }
 const reader=response.body.getReader(),decoder=new TextDecoder();
 const text:string[]=[];let bytes=0;
 try{
  for(;;){
   const {value,done}=await reader.read();if(done)break;
   bytes+=value.byteLength;
   if(bytes>WORKFLOW_JSON_MAX_BYTES){await reader.cancel().catch(()=>{});throw oversized();}
   text.push(decoder.decode(value,{stream:true}));
  }
 }catch(error){
  if(error instanceof IntegrationError)throw error;
  throw new IntegrationError('WORKFLOW_SERVICE_UNAVAILABLE',503);
 }finally{reader.releaseLock();}
 try{return JSON.parse(text.join('')+decoder.decode());}
 catch{throw invalid();}
}
