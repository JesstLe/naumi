import type {Artwork} from "../mock-data";
import {ImagegenHttpError,ImagegenPreparationCancelled,readImagegenResponse} from "../imagegen/http";
import {classifyGenerationFailure,type GenerationFailure} from "./generation-failure";
import type {GenerationStage} from "./generation-feedback";
import {canvasImageTaskHeaders,type CanvasImageTaskScope} from "./image-task-scope";
import type {CanvasResultImage} from "./result-attachment";

type Outcome={status:"succeeded";ids:string[]}|{status:"failed"|"stale";failure:GenerationFailure}|{status:"cancelled"};
type Services={prepare:(scope:CanvasImageTaskScope)=>Promise<FormData>;
  submit:(form:FormData,scope:CanvasImageTaskScope)=>Promise<Response>;
  attach:(scope:CanvasImageTaskScope,images:CanvasResultImage[])=>Promise<Artwork[]>;
  progress:(stage:GenerationStage,done:number)=>void;user:(value:unknown)=>void;errorText:string;expectedCount:number};
type Poll={status:string;done?:number;error?:string;reviewRequired?:boolean;operationStatus?:string;user?:unknown;
  shots?:Array<CanvasResultImage&{status:string}>};

/** Retains the original form/job/results across explicit retries. Poll failure
 * never returns to submit. Partial output is attached first, then remains a
 * partial task; checking it queries only the existing job. */
export function createCanvasDetailTask(input:Services){
  let form:FormData|undefined,jobId:string|undefined,images:CanvasResultImage[]=[],attempted=false,partial=false,message="",attached=false,done=0;
  let flight:Promise<Outcome>|undefined,complete:Outcome|undefined;
  const failure=(error:unknown)=>classifyGenerationFailure(error,{attempted,jobId,hasResults:images.length>0&&!attached});
  const land=async(scope:CanvasImageTaskScope):Promise<Outcome>=>{
    input.progress("saving",done);await input.attach(scope,images);scope.assertCurrent();attached=true;
    return partial?{status:"failed",failure:{kind:"failed",message:message||input.errorText,jobId}}:{status:"succeeded",ids:images.map(image=>image.id)};
  };
  const execute=async(scope:CanvasImageTaskScope):Promise<Outcome>=>{
    try{
      scope.assertCurrent();
      if(images.length&&!attached)return await land(scope);
      if(!jobId){
        input.progress("preparing",0);form??=await input.prepare(scope);scope.assertCurrent();attempted=true;
        const response=await input.submit(form,scope);
        const body=await readImagegenResponse<{jobId?:string}>(response,input.errorText);
        // Remember the accepted job even if the user navigated during the POST.
        if(body.jobId)jobId=body.jobId;scope.assertCurrent();
        if(!jobId)throw new Error(input.errorText);
      }
      input.progress("generating",done);const deadline=Date.now()+20*60*1000;
      for(;;){
        await new Promise(resolve=>setTimeout(resolve,2500));scope.assertCurrent();if(Date.now()>deadline)throw new Error(input.errorText);
        const headers=await canvasImageTaskHeaders(scope),response=await fetch(`/api/aplus?job=${encodeURIComponent(jobId)}`,{cache:"no-store",headers});
        const body=await readImagegenResponse<Poll>(response,input.errorText);
        if(body.status==="done"||body.status==="error"){
          images=(body.shots||[]).filter(shot=>shot.status==="done"&&typeof shot.id==="string"&&!!shot.id&&typeof shot.url==="string"&&!!shot.url);
          partial=body.status==="error"||body.operationStatus==="partial"||body.reviewRequired===true||body.operationStatus==="needs_attention"||images.length<input.expectedCount;
          message=body.error||input.errorText;attached=false;
        }
        scope.assertCurrent();done=Number(body.done||0);input.progress(body.status==="done"?"saving":"generating",done);
        if(body.status==="done"||body.status==="error"){
          if(body.user)input.user(body.user);if(!images.length)throw new Error(message);
          return await land(scope);
        }
      }
    }catch(error){
      if(!scope.isCurrent())return {status:"stale",failure:failure(error)};
      if(error instanceof ImagegenPreparationCancelled)return {status:"cancelled"};
      const value=failure(error);
      if(error instanceof ImagegenHttpError&&!jobId&&[400,401,402,403,404,413,415,422,429].includes(error.status))value.kind="not-started";
      return {status:"failed",failure:value};
    }
  };
  return {run(scope:CanvasImageTaskScope):Promise<Outcome>{
    if(complete)return Promise.resolve(scope.isCurrent()?complete:{status:"stale",failure:failure(new Error("请返回原画布继续"))});
    if(!flight)flight=execute(scope).then(result=>{if(result.status==="succeeded")complete=result;return result;}).finally(()=>{flight=undefined;});
    return flight;
  }};
}
