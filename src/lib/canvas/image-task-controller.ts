import {readCanvasGenerationReceipt} from "./generation-receipt";
import type {CanvasImageAttachment} from "./image-versions";
import type {CanvasHistoryAction} from "./history-model";
import type {Artwork} from "../mock-data";
import {ImagegenHttpError,ImagegenPreparationCancelled} from "../imagegen/http";
import {completeCanvasImagegen} from "../imagegen/client-recovery";
import {imageOutputWarningText} from "../imagegen/output-advisory";
import {classifyGenerationFailure,type GenerationFailure} from "./generation-failure";
import type {GenerationStage} from "./generation-feedback";
import type {CanvasPoint} from "./stable-placement";
import {canvasImageTaskHeaders,type CanvasImageTaskScope} from "./image-task-scope";
import {createCanvasResultAttachment,createCanvasImageVersionAttachment} from "./result-attachment";

export type CanvasGeneratedImage={id:string;url:string;width?:number;height?:number};
type Result={status:"succeeded"|"partial";images:CanvasGeneratedImage[];artworks:Artwork[];jobId:string}|{status:"cancelled"}|{status:"stale"}|{status:"failed";failure:GenerationFailure};
type Services={
  fanout?:{count:number;bind:(images:CanvasGeneratedImage[])=>void;point:(id:string)=>CanvasPoint|undefined};
  replacement?:{nodeId:string;history:(action:Extract<CanvasHistoryAction,{kind:"image-version"}>)=>void};
  scope:CanvasImageTaskScope;prepare:()=>Promise<FormData>;
  submit:(form:FormData,current:()=>boolean)=>Promise<Response>;
  position:()=>CanvasPoint;
  merge:(ids:string[],current:()=>boolean)=>Promise<Artwork[]>;
  history:(ids:string[],artworks:Artwork[])=>void;
  attached?:(images:CanvasGeneratedImage[],artworks:Artwork[])=>Promise<void>|void;
  stage:(stage:GenerationStage)=>void;user:(user:unknown)=>void;notice:(message:string)=>void;
  errorText:string;saveErrorText:string;resultGap:number;
};
async function readBody(response:Response):Promise<Record<string,any>>{
  const text=await response.text();try{return text?JSON.parse(text):{};}catch{throw new Error("服务响应异常，请稍后检查原任务");}
}

/** Application controller for both existing-image and blank/text-image nodes.
 * Owns submit -> poll -> placement -> attachment -> receipt completion. React
 * only projects stage/failure and supplies document operations, not another loop.
 * A retry with known results resumes attachment; a known job is queried, never
 * submitted again. Unknown submission retains the same prepared request for the
 * existing receipt-first submit adapter, never an automatic second POST. */
export function createCanvasImageTask(input:Services){
  const {scope}=input;
  let form:FormData|undefined,jobId:string|undefined,images:CanvasGeneratedImage[]=[],attempted=false,terminal=false,partial=false;
  let inflight:Promise<Result>|undefined;
  let refreshPartial=false;
  let completed:Result|undefined,canvasAttachment:CanvasImageAttachment|undefined;
  const versionAttachment=input.replacement?createCanvasImageVersionAttachment({nodeId:input.replacement.nodeId,merge:input.merge,history:input.replacement.history}):undefined;
  const guard=()=>scope.assertCurrent();
  const attachment=createCanvasResultAttachment({position:input.position,layout:input.fanout?{kind:"fanout",point:input.fanout.point}:{kind:"pixels",gap:input.resultGap},saveErrorText:input.saveErrorText,
    merge:input.merge,history:input.history,attached:async(images,artworks)=>input.attached?.(images as CanvasGeneratedImage[],artworks)});
  const attach=async():Promise<Result>=>{
    guard();input.stage("saving");input.fanout?.bind(images);
    const artworks=versionAttachment?await versionAttachment(scope,canvasAttachment):await attachment(scope,images);guard();
    // Partial/needs-review delivery retains its durable receipt for the original
    // task. Image availability is not proof that every requested output finished.
    if(!partial&&jobId)completeCanvasImagegen(jobId,{owner:scope.owner,workspace:scope.workspace,project:scope.project});
    if(partial&&input.fanout)refreshPartial=true;
    return {status:partial?"partial":"succeeded",images,artworks,jobId:jobId!};
  };
  const execute=async():Promise<Result>=>{
    try{
      guard();
      if(images.length&&!refreshPartial){
        if(versionAttachment&&!canvasAttachment&&jobId){const headers=await canvasImageTaskHeaders(scope);guard();const receipt=await readCanvasGenerationReceipt(jobId,headers);guard();if(!receipt)throw new Error("原任务回执读取暂时失败，请稍后检查");const {response,data:body}=receipt;if(!response.ok)throw new Error(body.error||input.errorText);canvasAttachment=body.canvasAttachment;}
        return await attach();
      }
      if(!jobId){
        input.stage("preparing");form??=await input.prepare();guard();attempted=true;
        const response=await input.submit(form,scope.isCurrent),body=await readBody(response);guard();
        if(!response.ok)throw new ImagegenHttpError(body.error||input.errorText,response.status,body.accepted===false||[400,401,403,409,413,422,429].includes(response.status)?false:undefined);
        if(typeof body.jobId!=="string"||!body.jobId)throw new Error(input.errorText);jobId=body.jobId;
      }
      refreshPartial=false;
      input.stage("generating");const deadline=Date.now()+6*60*1000;
      for(;;){
        await new Promise(resolve=>setTimeout(resolve,2500));guard();if(Date.now()>deadline)throw new Error(input.errorText);
        const headers=await canvasImageTaskHeaders(scope);guard();
        const receipt=await readCanvasGenerationReceipt(jobId,headers);guard();if(!receipt)continue;
        const {response,data:body}=receipt;if(!response.ok)throw new Error(body.error||input.errorText);
        if(body.user)input.user(body.user);
        if(body.status==="done"||body.status==="error"){
          canvasAttachment=body.canvasAttachment;
          images=(Array.isArray(body.images)?body.images:[]).filter((image:any)=>typeof image?.id==="string"&&!!image.id&&typeof image.url==="string"&&!!image.url).map((image:any)=>({id:image.id,url:image.url,width:image.width,height:image.height}));
          terminal=!body.reviewRequired&&body.operationStatus!=="needs_attention";
          partial=body.status==="error"||body.operationStatus==="partial"||!!input.fanout&&(images.length<input.fanout.count||!terminal);
          const warning=imageOutputWarningText(body.warnings);if(warning)input.notice(warning);
          if(body.status==="error"&&!(input.fanout&&images.length))throw new Error(body.error||input.errorText);
          if(!images.length)throw new Error(input.errorText);
          return await attach();
        }
        input.stage("generating");
      }
    }catch(error){
      if(!scope.isCurrent())return {status:"stale"};
      if(error instanceof ImagegenPreparationCancelled)return {status:"cancelled"};
      return {status:"failed",failure:classifyGenerationFailure(error,{attempted,jobId,terminal,hasResults:images.length>0})};
    }
  };
  return {run():Promise<Result>{
    if(completed)return Promise.resolve(scope.isCurrent()?completed:{status:"stale"});
    if(!inflight)inflight=execute().then(result=>{if(result.status==="succeeded"||result.status==="partial"&&!input.fanout)completed=result;return result;}).finally(()=>{inflight=undefined;});
    return inflight;
  }};
}
