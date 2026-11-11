import type {Artwork} from "../mock-data";
import {readBrowserImage} from "../browser-image-cache";
import {ImagegenHttpError,ImagegenPreparationCancelled} from "../imagegen/http";
import {canvasGenerationHttpError,classifyGenerationFailure,type GenerationFailure} from "./generation-failure";
import type {CanvasImageTaskScope} from "./image-task-scope";
import type {CanvasResultImage} from "./result-attachment";

export type CanvasEditRequest={kind:"cutout";source:Artwork}|{kind:"expand";artworkId:string;ratio:string;anchor:string}|{kind:"annotate";form:FormData};
type Prepared={url:string;init:RequestInit};
export async function prepareCanvasEditTask(input:CanvasEditRequest,scope:CanvasImageTaskScope):Promise<Prepared>{
  scope.assertCurrent();
  if(input.kind==="expand")return {url:"/api/canvas/expand",init:{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({artworkId:input.artworkId,ratio:input.ratio,anchor:input.anchor})}};
  if(input.kind==="annotate")return {url:"/api/canvas/annotate",init:{method:"POST",body:input.form}};
  let blob:Blob;try{blob=await readBrowserImage(input.source.image);}catch{throw new ImagegenHttpError("原图读取失败，本次未提交抠图",400,false);}
  scope.assertCurrent();const {source}=input,form=new FormData();
  form.append("image",new File([blob],"cutout-original.png",{type:blob.type||"image/png"}));
  for(const [key,value] of Object.entries({email:scope.owner,parentId:source.id,title:`${source.title||"作品"} · 抠图`,category:source.category||"main",ratio:source.ratio||"auto",resolution:source.resolution||"1K",quality:"medium"}))form.append(key,value);
  return {url:"/api/cutout",init:{method:"POST",body:form}};
}
type Outcome={status:"succeeded";id:string}|{status:"failed"|"stale";failure:GenerationFailure}|{status:"cancelled"};

/** Synchronous edit recovery owns its request and result, not its React card.
 * Once a result is known, neither attachment retry nor project restoration can
 * call the paid submit adapter again. */
export function createCanvasEditTask(input:{request:CanvasEditRequest;
  submit:(request:Prepared,scope:CanvasImageTaskScope)=>Promise<Response>;
  attach:(scope:CanvasImageTaskScope,images:CanvasResultImage[])=>Promise<Artwork[]>;
  user:(value:unknown)=>void;saving:()=>void;errorText:string}){
  let prepared:Prepared|undefined,resultId:string|undefined,operationId:string|undefined,attempted=false,flight:Promise<Outcome>|undefined,complete:Outcome|undefined;
  const failure=(error:unknown)=>classifyGenerationFailure(error,{attempted,hasResults:!!resultId,jobId:resultId?`result:${resultId}`:operationId});
  const execute=async(scope:CanvasImageTaskScope):Promise<Outcome>=>{
    try{
      scope.assertCurrent();
      if(!resultId){
        prepared??=await prepareCanvasEditTask(input.request,scope);scope.assertCurrent();attempted=true;
        const response=await input.submit(prepared,scope);let data:Record<string,any>;
        try{data=await response.json();if(!data||typeof data!=="object"||Array.isArray(data))throw Error();}catch{throw new Error("服务响应异常，请检查原操作");}
        operationId=typeof data?.operationId==="string"?data.operationId:operationId;
        if(response.ok&&typeof data?.id==="string"&&data.id)resultId=data.id;
        scope.assertCurrent();
        if(!response.ok||!resultId){
          throw canvasGenerationHttpError(response.status,data,input.errorText);
        }
        if(data.user)input.user(data.user);
      }
      input.saving();await input.attach(scope,[{id:resultId}]);scope.assertCurrent();return {status:"succeeded",id:resultId};
    }catch(error){
      if(!scope.isCurrent())return {status:"stale",failure:failure(error)};
      if(error instanceof ImagegenPreparationCancelled)return {status:"cancelled"};
      return {status:"failed",failure:failure(error)};
    }
  };
  return {run(scope:CanvasImageTaskScope):Promise<Outcome>{
    if(complete)return Promise.resolve(scope.isCurrent()?complete:{status:"stale",failure:failure(new Error("请返回原画布继续"))});
    if(!flight)flight=execute(scope).then(result=>{if(result.status==="succeeded")complete=result;return result;}).finally(()=>{flight=undefined;});return flight;
  }};
}
