import {readBounded} from "../supplier-cost/io";
import {ModelConfigError} from "./types";
import {chatAnswerText} from "./chat-completion-response";

const invalid=()=>new ModelConfigError("SUPPLIER_TEXT_INVALID","供应通道未返回有效文字或工具调用",502);
const output=(m:any)=>!!chatAnswerText(m?.content).trim() || typeof m?.refusal==="string"&&!!m.refusal.trim() || Array.isArray(m?.tool_calls)&&m.tool_calls.length>0 || !!m?.function_call;

/** Buffer only the prelude. A failed attempt cannot leak tokens before fallback. */
export async function prepareChannelText(response:Response,onFinish:(success:boolean,usage?:unknown,cancelled?:boolean)=>Promise<void>,signal?:AbortSignal) {
 if(!/text\/event-stream/i.test(response.headers.get("content-type") || "")){
  const raw=await readBounded(response,4*1024*1024);let data:any;try{data=JSON.parse(raw);}catch{throw invalid();}
  if(data.error||!Array.isArray(data.choices)||!data.choices.some((c:any)=>output(c.message)))throw invalid();
  const headers=new Headers(response.headers);headers.delete("content-length");headers.set("content-type","application/json");
  return {response:new Response(raw,{status:response.status,headers}),streaming:false,usage:data.usage};
 }
 if(!response.body)throw invalid();
 const reader=response.body.getReader(),decoder=new TextDecoder(),prelude:Uint8Array[]=[];
 let pending="",bytes=0,hasOutput=false,completed=false,done=false,usage:unknown,finalized=false;
 const parse=(line:string)=>{
  if(!line.startsWith("data:"))return;const value=line.slice(5).trim();if(!value)return;
  if(value==="[DONE]"){completed=true;return;}
  let data:any;try{data=JSON.parse(value);}catch{throw invalid();}
  if(data.error)throw invalid();if(data.usage)usage=data.usage;
  for(const choice of data.choices||[]){if(output(choice.delta)||output(choice.message))hasOutput=true;if(choice.finish_reason)completed=true;}
 };
 const consume=(part:Uint8Array)=>{pending+=decoder.decode(part,{stream:true});let end;while((end=pending.indexOf("\n"))>=0){parse(pending.slice(0,end).replace(/\r$/,""));pending=pending.slice(end+1);}if(pending.length>131072)throw invalid();};
 const aborted=()=>{void(async()=>{try{await reader.cancel(signal?.reason);}finally{await finish(false);}})().catch(()=>{});};
 const finish=async(success:boolean,cancelled=false)=>{if(finalized)return;finalized=true;signal?.removeEventListener("abort",aborted);await onFinish(success,usage,cancelled);};
 try{
  while(!hasOutput){const part=await reader.read();if(part.done){done=true;pending+=decoder.decode();if(pending)parse(pending);if(!hasOutput)throw invalid();break;}bytes+=part.value.byteLength;if(bytes>1024*1024)throw invalid();prelude.push(part.value);consume(part.value);}
 }catch(error){await reader.cancel(error).catch(()=>{});throw error;}
 signal?.addEventListener("abort",aborted,{once:true});if(signal?.aborted)aborted();
 let prefix=true;
 const body=new ReadableStream<Uint8Array>({
  async pull(controller){try{
   signal?.throwIfAborted();
   if(prefix){prefix=false;const first=new Uint8Array(bytes);let offset=0;for(const part of prelude){first.set(part,offset);offset+=part.byteLength;}prelude.length=0;if(first.length){controller.enqueue(first);return;}}
   if(done){if(!completed)throw invalid();await finish(true);controller.close();return;}
   const part=await reader.read();if(part.done){done=true;pending+=decoder.decode();if(pending)parse(pending);if(!completed)throw invalid();await finish(true);controller.close();return;}
   consume(part.value);controller.enqueue(part.value);
  }catch(error){await reader.cancel(error).catch(()=>{});try{await finish(false);}finally{controller.error(error);}}},
  async cancel(reason){try{await reader.cancel(reason);}finally{await finish(false,true);}},
 });
 const headers=new Headers(response.headers);headers.delete("content-length");
 return {response:new Response(body,{status:response.status,headers}),streaming:true};
}
