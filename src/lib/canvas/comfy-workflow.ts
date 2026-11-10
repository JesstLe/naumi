import {browserRandomUUID} from "../browser-crypto";
import {ImagegenHttpError,readImagegenResponse} from "../imagegen/http";
import {canvasImageTaskHeaders,type CanvasImageTaskScope} from "./image-task-scope";
import type {CanvasResultImage} from "./result-attachment";
import type {ComfyRunPayload,ComfyRunResult} from "../comfyui/run-contract";

type Storage=Pick<globalThis.Storage,"getItem"|"setItem"|"removeItem">;
type Services={
  sourceId?:string;payload:ComfyRunPayload;receiptKey:string;storage?:Pick<Storage,"getItem"|"setItem"|"removeItem">;
  attach:(scope:CanvasImageTaskScope,images:CanvasResultImage[])=>Promise<unknown>;
  submitted:(taskId:string)=>Promise<unknown>;
  saving:()=>void;
};
export function comfyRunReceiptKey(scope:CanvasImageTaskScope,sourceId:string){
  return "naumi.comfy-run.v1:"+[scope.owner,scope.workspace,scope.project,sourceId].map(encodeURIComponent).join(":");
}
function images(value:unknown):NonNullable<ComfyRunResult["images"]>{
  return Array.isArray(value)?value.filter(item=>item&&typeof item.id==="string"&&!!item.id&&typeof item.url==="string"&&!!item.url):[];
}

/** One original intent, not another execution engine. The existing creation
 * receipt recovers images; accepted videos belong to the native video task
 * owner. Known outputs resume attachment without resubmitting the workflow. */
export function createCanvasComfyWorkflow(input:Services){
  const payload=structuredClone(input.payload);
  let operationId:string|undefined;
  try{operationId=input.storage?.getItem(input.receiptKey)||undefined;}catch{/* memory still retains this attempt */}
  let attempted=!!operationId,finished=false,cached:ComfyRunResult|undefined,inflight:Promise<ComfyRunResult>|undefined;
  const remember=()=>{try{input.storage?.setItem(input.receiptKey,operationId!);}catch{/* best effort browser persistence */}};
  const clear=()=>{try{const storage=input.storage;if(storage?.getItem(input.receiptKey)===operationId)storage?.removeItem(input.receiptKey);}catch{/* durable source remains authoritative */}};
  const execute=async(scope:CanvasImageTaskScope):Promise<ComfyRunResult>=>{
    try{
      scope.assertCurrent();
      if(!cached||cached.state==="partial"||cached.state==="needs_review"){
        const headers=await canvasImageTaskHeaders(scope);scope.assertCurrent();
        let response:Response;
        if(attempted){
          response=await fetch(`/api/comfyui/run?operationId=${encodeURIComponent(operationId!)}`,{cache:"no-store",headers});
        }else{
          operationId??=`comfy-${browserRandomUUID()}`;remember();attempted=true;
          headers.set("content-type","application/json");headers.set("x-naumi-canvas","1");
          response=await fetch("/api/comfyui/run",{method:"POST",headers,body:JSON.stringify({artworkId:input.sourceId,...payload,source:"canvas",...(scope.project!=="workspace"?{projectKey:scope.project}:{}),idempotencyKey:operationId})});
        }
        let body:Record<string,any>;
        try{body=await readImagegenResponse(response,"工作流未完成，请检查原任务");}
        catch(error){if(error instanceof ImagegenHttpError&&error.accepted===false){attempted=false;finished=true;clear();}throw error;}
        const taskId=typeof body.taskId==="string"&&body.taskId?body.taskId:undefined;
        // Capture before the view guard: a late saved result is retained for an
        // explicit continuation in its original view, never projected elsewhere.
        cached={state:taskId?"submitted":body.state||"completed",taskId,creationId:body.creationId,images:images(body.images),videos:Array.isArray(body.videos)?body.videos:[],videoArtworkId:typeof body.videoArtworkId==="string"?body.videoArtworkId:undefined,message:typeof body.message==="string"?body.message:undefined};
        if(cached.state!=="failed"&&!taskId&&!cached.images?.length&&!cached.videos?.length)cached.state="needs_review";
        scope.assertCurrent();
      }
      if(cached.state==="submitted"&&cached.taskId){await input.submitted(cached.taskId);scope.assertCurrent();finished=true;clear();return cached;}
      const outputs:CanvasResultImage[]=[...(cached.images||[]),...(cached.videoArtworkId?[{id:cached.videoArtworkId}]:[])];
      if(outputs.length){scope.assertCurrent();input.saving();await input.attach(scope,outputs);scope.assertCurrent();}
      if(cached.state==="completed"||cached.state==="failed"){finished=true;clear();}
      return cached;
    }catch(error){
      if(!scope.isCurrent())return {state:"stale"};
      if(attempted)return {...cached,state:"needs_review",message:cached?.images?.length?"结果同步未完成，请检查原任务":"工作流回执尚未确认，请检查原任务"};
      throw error;
    }
  };
  return {get finished(){return finished;},get operationId(){return operationId;},run(scope:CanvasImageTaskScope){
    if(!inflight)inflight=execute(scope).finally(()=>{inflight=undefined;});
    return inflight;
  }};
}
