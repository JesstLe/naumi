import type {Artwork} from "../mock-data";
import type {FeatureId} from "../billing/types";
import type {useBilling} from "../billing/client";
import type {RetainedBillingSubmission} from "../billing/client-submission";
import {authHeader} from "../supabase";
import {adminConfiguredFeature} from "../model-config/selection-policy";
import {chosenFeatureModel,featureModelManaged,ensureFeatureModelSelection} from "../model-config/feature-client";
import {submitCanvasImagegen,resolveCanvasDetailFrame,resolveCanvasLegacyFrame,type CanvasFrameChoice} from "../imagegen/canvas-client";
import {canvasReferenceManifestSchema,compileReferenceInstructions} from "../imagegen/reference-labels";
import {ImagegenHttpError,ImagegenPreparationCancelled} from "../imagegen/http";
import {normalizeCanvasRatio,normalizeCanvasResolution,normalizeCanvasCount,normalizeCanvasQuality,canvasSourceFrameEdit,canvasSourceFrameRatio} from "./generation-parameters";
import type {CanvasImageTaskScope} from "./image-task-scope";

export type CanvasCreationRequestInit=RequestInit&{isCurrent?:()=>boolean;submission?:RetainedBillingSubmission};
export type CanvasCreationRequestContext={
  scope:CanvasImageTaskScope;authenticated:boolean;sourceId?:string;
  sources:readonly Pick<Artwork,"id"|"resolution"|"width"|"height"|"ratio">[];
  model:string;quality:string;toolQualities:Readonly<Partial<Record<FeatureId,string>>>;
};
type Services={
  billing:Pick<ReturnType<typeof useBilling>,"quote"|"submit"|"quoteAndSubmit">;
  request:(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
  chooseFrame:(choices:CanvasFrameChoice[])=>Promise<string|null>;
  notice:(message:string)=>void;
};
const FEATURES:Readonly<Record<string,FeatureId>>={
  "/api/generate-image":"canvas.image","/api/aplus":"image.aplus","/api/suite":"image.suite","/api/cutout":"tool.cutout",
  "/api/canvas/image-tasks":"canvas.image","/api/canvas/expand":"canvas.expand","/api/canvas/text-edit":"canvas.text-edit",
  "/api/canvas/annotate":"canvas.annotate","/api/canvas/text-generate":"canvas.text-generate","/api/canvas/assistant":"canvas.assistant",
  "/api/canvas/ocr":"canvas.ocr","/api/video/generate":"video.generate",
};

/** A request captures document facts once. This adapter owns only translation:
 * frame/reference preparation -> original imagegen or retained billing owner.
 * It never owns a tariff, intent cache, task, or supplier retry loop. */
export async function submitCanvasCreationRequest(input:RequestInfo|URL,initial:CanvasCreationRequestInit,context:CanvasCreationRequestContext,services:Services){
  const {scope}=context,isCurrent=()=>scope.isCurrent()&&(initial.isCurrent?.()??true),assertCurrent=()=>{scope.assertCurrent();if(!isCurrent())throw new ImagegenPreparationCancelled();};
  assertCurrent();
  const headers=new Headers(initial.headers);headers.set("x-naumi-workspace",scope.workspace);
  if(scope.project!=="workspace")headers.set("x-naumi-project-context",scope.project);else headers.delete("x-naumi-project-context");
  let init={...initial,headers};
  if(init.submission?.ready){const auth=await authHeader();assertCurrent();return init.submission.retry(services.billing,assertCurrent,auth);}
  const path=String(input).split("?")[0],feature=FEATURES[path];
  if(init.method!=="POST"||!feature)return services.request(input,init);
  if(path==="/api/canvas/ocr"){await ensureFeatureModelSelection("canvas.ocr");assertCurrent();}
  const form=init.body instanceof FormData?init.body:null;
  if(path==="/api/aplus"&&form){await resolveCanvasDetailFrame(form,services.chooseFrame,isCurrent);assertCurrent();}
  const body:Record<string,any>=form?Object.fromEntries(Array.from(form.entries()).filter(entry=>typeof entry[1]==="string")):typeof init.body==="string"?JSON.parse(init.body):{};
  if(path==="/api/generate-image"&&form&&context.authenticated&&body.ratiogen!=="1"&&(!body.userPrompt||String(body.userPrompt).trim()===String(body.prompt).trim())){
    return submitCanvasImagegen(form,context.sourceId,services.notice,{owner:scope.owner,project:scope.project,chooseFrame:services.chooseFrame,isCurrent});
  }
  if(path==="/api/generate-image"){
    if(form){form.set("ratio",normalizeCanvasRatio(body.ratio));await resolveCanvasLegacyFrame(form,services.chooseFrame,isCurrent);assertCurrent();body.ratio=String(form.get("ratio")||"auto");}
    if(form?.has("canvasReferences")){
      try{
        const manifest=canvasReferenceManifestSchema.parse(JSON.parse(String(form.get("canvasReferences"))));
        if(manifest.length!==form.getAll("image").length)throw new Error("参考图片顺序不一致，请重新选择");
        body.prompt=compileReferenceInstructions(String(body.prompt||""),manifest);
        form.set("prompt",body.prompt);form.delete("canvasReferences");delete body.canvasReferences;
      }catch(error){throw new ImagegenHttpError(error instanceof Error?error.message:"参考图片信息无效",400,false);}
    }
    body.ratio=normalizeCanvasRatio(body.ratio);body.resolution=normalizeCanvasResolution(body.resolution);body.count=String(normalizeCanvasCount(body.count));
    delete body.targetWidth;delete body.targetHeight;if(form){form.delete("targetWidth");form.delete("targetHeight");}
  }
  if(path==="/api/generate-image"||["/api/canvas/image-tasks","/api/canvas/expand","/api/canvas/annotate","/api/canvas/text-edit"].includes(path)){
    body.quality=normalizeCanvasQuality(body.quality||context.toolQualities[feature]||context.quality);
    if(form){for(const key of ["ratio","resolution","count","quality"]){if(body[key]!==undefined)form.set(key,String(body[key]));}}
    else init={...init,body:JSON.stringify(body)};
  }
  const source=context.sources.find(art=>art.id===body.artworkId);
  if(source&&canvasSourceFrameEdit(path)){
    body.ratio=canvasSourceFrameRatio(source);
    if(form)form.set("ratio",body.ratio);else init={...init,body:JSON.stringify(body)};
  }
  const quantity=path==="/api/aplus"?Math.max(1,form?.getAll("module").length||body.modules?.length||1):path==="/api/suite"?(body.structure==="custom"?JSON.parse(String(body.shots||"[]")).length:13):Number(body.count||1);
  for(const [key,value] of Object.entries(await authHeader()))headers.set(key,value);assertCurrent();
  headers.set("x-naumi-workspace",scope.workspace);if(scope.project!=="workspace")headers.set("x-naumi-project-context",scope.project);else headers.delete("x-naumi-project-context");
  if(body.quality)headers.set("x-naumi-image-quality",String(body.quality));headers.set("x-naumi-canvas","1");
  const modelId=["/api/aplus","/api/suite"].includes(path)?body.modelId||body.model||context.model:adminConfiguredFeature(feature)?undefined:featureModelManaged(feature)&&!["image.generate","video.generate"].includes(feature)?chosenFeatureModel(feature):body.modelId||body.model||undefined;
  const facts={canvas:true,feature,quantity,quality:String(body.quality||context.quality),resolution:String(body.resolution||source?.resolution||"1K"),modelId,providerId:body.providerId,ratio:body.ratio};
  return init.submission?init.submission.submit(services.billing,path,{...init,headers},facts,assertCurrent):services.billing.quoteAndSubmit(path,{...init,headers},facts,assertCurrent);
}
