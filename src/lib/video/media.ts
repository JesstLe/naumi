import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,writeFile,readFile,lstat,statfs} from "node:fs/promises";
import path from "node:path";
import type {MediaProbe,MediaJobRequest} from "./media-job-schema";
import {validateMediaAuxiliaryText,safeMediaName} from "../../../scripts/video-fusion/media-engine.mjs";

export const MEDIA_JOB_DIR=path.resolve(process.env.MEDIA_JOB_DIR||"./data/media-jobs");
export type WorkerInput={name:string;bytes:number;sha256:string};
export type WorkerAuxiliaryInput=WorkerInput&{text:boolean};
export type WorkerOutput=WorkerInput&{probe:MediaProbe|null;fragment?:boolean};
export type WorkerJobView={id:string;status:"queued"|"processing"|"completed"|"failed"|"cancelled";processedSeconds:number;error?:string;result?:{outputs:WorkerOutput[];probes:MediaProbe[];stdout:string}};
export function mediaWorkerConfigured(){return !!process.env.MEDIA_WORKER_ORIGIN&&String(process.env.MEDIA_WORKER_SECRET||"").length>=32;}
export class MediaWorkerError extends Error{constructor(message:string,readonly status:number){super(message);this.name="MediaWorkerError";}}
function mediaWorkerOrigin(){
  if(!mediaWorkerConfigured())throw new Error("媒体处理服务未配置");const origin=new URL(process.env.MEDIA_WORKER_ORIGIN!);
  if(!["http:","https:"].includes(origin.protocol)||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=="/")throw new Error("媒体处理服务地址无效");return origin;
}
export async function mediaWorkerHealth():Promise<{ok:boolean;running:number;queued:number;terminal:number;maxActive:number;sandbox:boolean;version:string}>{
  const response=await fetch(new URL("/health",mediaWorkerOrigin()),{headers:{authorization:`Bearer ${process.env.MEDIA_WORKER_SECRET}`},redirect:"error",signal:AbortSignal.timeout(5000),cache:"no-store"});
  if(!response.ok)throw new MediaWorkerError("媒体处理服务暂不可用",response.status);return response.json();
}
export function mediaJobDirectory(id:string){if(!/^[0-9a-f-]{36}$/.test(id))throw new Error("媒体任务编号无效");return path.join(MEDIA_JOB_DIR,id);}
export async function mediaWorkerRequest(id:string,method:"GET"|"POST"|"DELETE"|"PATCH",body?:unknown):Promise<WorkerJobView>{
  const origin=mediaWorkerOrigin();
  const response=await fetch(new URL(`/jobs/${id}`,origin),{method,redirect:"error",headers:{authorization:`Bearer ${process.env.MEDIA_WORKER_SECRET}`,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000),cache:"no-store"});
  const value=await response.json();if(!response.ok)throw new MediaWorkerError(value.error||`媒体处理服务错误(${response.status})`,response.status);return value;
}
export async function prepareMediaInputs(id:string,objects:Array<{bytes:Uint8Array;extension:string;name?:string}>,inspection=false):Promise<WorkerInput[]>{
  const directory=path.join(mediaJobDirectory(id),"inputs");await mkdir(directory,{recursive:true,mode:0o700});
  await writeFile(path.join(mediaJobDirectory(id),"prepared-state.json"),JSON.stringify({owner:"naumi-media-app",id,inspection,createdAt:new Date().toISOString()}),{mode:0o600,flag:"wx"}).catch(error=>{if(error?.code!=="EEXIST")throw error;});
  const requested=objects.reduce((size,object)=>size+object.bytes.byteLength,0);if(requested>250*1024*1024)throw new Error("媒体输入超过250MB限制");
  const disk=await statfs(directory);if(Number(disk.bavail)*Number(disk.bsize)<requested+750*1024*1024)throw new Error("媒体临时空间不足");
  let total=0;const result=[];
  for(let i=0;i<objects.length;i++){
    const object=objects[i];total+=object.bytes.byteLength;if(total>250*1024*1024)throw new Error("媒体输入超过250MB限制");
    if(!/^[a-z0-9]{1,8}$/.test(object.extension))throw new Error("媒体扩展名无效");
    const name=safeMediaName(object.name||`input-${i}.${object.extension}`),sha256=createHash("sha256").update(object.bytes).digest("hex");
    await mkdir(path.dirname(path.join(directory,name)),{recursive:true,mode:0o700});
    await writeFile(path.join(directory,name),object.bytes,{mode:0o600});result.push({name,bytes:object.bytes.byteLength,sha256});
  }
  return result;
}
export function auxiliaryMediaBytes(file:MediaJobRequest["auxiliaryFiles"][number]){
  if(file.encoding==="base64"&&!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content))throw new Error("辅助文件编码无效");
  if(file.encoding==="utf8")validateMediaAuxiliaryText(file.content);
  const bytes=Buffer.from(file.content,file.encoding==="base64"?"base64":"utf8");if(!bytes.length)throw new Error("辅助文件为空");return bytes;
}
export async function prepareMediaAuxiliary(id:string,files:MediaJobRequest["auxiliaryFiles"]):Promise<WorkerAuxiliaryInput[]>{
  const directory=path.join(mediaJobDirectory(id),"inputs");await mkdir(directory,{recursive:true,mode:0o700});let total=0;const inputs=[];
  for(let index=0;index<files.length;index++){
    const file=files[index],bytes=auxiliaryMediaBytes(file);total+=bytes.length;if(total>512*1024)throw new Error("辅助文件总量超过限制");
    const name=`aux-${index}-${file.name}`;if(!/^aux-\d+-[A-Za-z0-9_.-]+$/.test(name))throw new Error("辅助文件名无效");
    await writeFile(path.join(directory,name),bytes,{mode:0o600});inputs.push({name,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),text:file.encoding==="utf8"});
  }return inputs;
}
export async function readMediaWorkerOutput(id:string,item:WorkerOutput){
  if(!/^[a-zA-Z0-9_%.$-]+(?:\/[a-zA-Z0-9_%.$-]+)*$/.test(item.name)||item.name.split("/").some(p=>p==="."||p===".."))throw new Error("媒体输出路径无效");
  const filename=path.join(mediaJobDirectory(id),"results",...item.name.split("/")),info=await lstat(filename);
  if(!info.isFile()||info.isSymbolicLink()||info.size!==item.bytes||info.size>500*1024*1024||info.size<1)throw new Error("媒体输出字节无效");
  const bytes=await readFile(filename);if(createHash("sha256").update(bytes).digest("hex")!==item.sha256)throw new Error("媒体输出校验失败");return bytes;
}
export async function waitMediaWorker(id:string,timeoutMs=190000):Promise<WorkerJobView>{
  const deadline=Date.now()+timeoutMs;let view:WorkerJobView;
  do{view=await mediaWorkerRequest(id,"GET");if(view.status==="completed")return view;if(view.status==="failed"||view.status==="cancelled")throw new Error(view.error||"媒体处理失败");await new Promise(resolve=>setTimeout(resolve,200));}while(Date.now()<deadline);
  await mediaWorkerRequest(id,"DELETE").catch(()=>{});throw new Error("媒体处理超时");
}
/** DELETE installs a cancellation tombstone even for an uncertain POST. Remove
 * copies only after the worker confirms terminal status and reaps its child. */
export async function cleanupMediaWorkerJob(id:string,cancel=false):Promise<boolean>{
  try{
    if(cancel)await mediaWorkerRequest(id,"DELETE");
    await mediaWorkerRequest(id,"PATCH");return true;
  }catch(error){
    if(error instanceof MediaWorkerError&&error.status===404){
      await mediaWorkerRequest(id,"DELETE");await mediaWorkerRequest(id,"PATCH");return true;
    }
    return false;
  }
}
/** App never executes FFmpeg. Inspection uses the same isolated processing service. */
export async function probeMedia(bytes:Uint8Array,extension="mp4"):Promise<MediaProbe>{
  const id=randomUUID();let completed=false,prepared=false;try{
    const health=await mediaWorkerHealth();if(health.running+health.queued>=health.maxActive||health.terminal>=8)throw new MediaWorkerError("媒体处理队列已满",429);
    prepared=true;const inputs=await prepareMediaInputs(id,[{bytes,extension}],true);
    await mediaWorkerRequest(id,"POST",{action:"ffprobe",inputs,outputs:[],verifyStreams:true,inspectOnly:true,args:["-v","error","-show_streams","-show_format","-of","json","asset:0"]});
    const view=await waitMediaWorker(id);completed=true;const probe=view.result?.probes[0];if(!probe)throw new Error("媒体探测无结果");return probe;
  }finally{if(prepared)await cleanupMediaWorkerJob(id,!completed).catch(()=>false);}
}
export async function probeVideo(bytes:Uint8Array):Promise<MediaProbe>{const probe=await probeMedia(bytes);if(!probe.videoCodec||!probe.width||!probe.height||!probe.durationSeconds)throw new Error("视频没有有效可播放流");return probe;}
