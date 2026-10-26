import {resolveImageResolution,resolutionFallbackMessage,resolutionFacts,upstreamAcceptsResolution} from "../model-config/resolution-fallback";
import "server-only";
import {createHash} from "node:crypto";
import {imagegenRequestSchema} from "./schema";
import {resolveImagegenIntent} from "./intent";
import {readImagegenInputs} from "./inputs";
import { automaticFrameRatio } from "./frame-ratio";
import { REVERSE_HUB_RATIO_MESSAGE } from "./ratio-support";
import { imageRequestAdmission } from "./request-admission";
import { ImagegenPlanError } from "./plan-error";
import { ExactImageSizeError } from "./request-size";
import {getModelExecutionServices} from "../model-config/execution-services";
import {selectImageQuality} from "../model-config/image-quality-selection";
import {prepareImageOperation} from "../model-config/image-preparation";
import {selectFeatureModel} from "../model-config/model-selection";
import {selectedImagePreset} from "../model-config/image-preset";
import {simulateModel} from "@/lib/model-config/simulation";
import { assertToolScope, featureDefaultModel } from "../model-config/feature-model-policy";
import {MAX_GENERATION_DIMENSION,resolutionForLongSide} from "../mock-data";
import {routeImageModel} from "../image-model-routing";
import {quoteForActor} from "../billing/quotation";
import {runExecutionBundle} from "../model-config/context";
import {resolveImageSkill} from "../image-skills/server";
import {mapImagegenParameters,imagegenWireRequest} from "./parameters";
import {publishedImagegenCapabilities} from "./capabilities";
import type {ImagegenRequest,ImagegenPlan,Intent} from "./types";
import type {ModelFacts} from "../model-config/types";
import {userFeaturePolicy,FeatureAccessError} from "@/lib/feature-access/repository";
import {allows} from "../feature-access/catalog";
import {assertCurrentCreationFeature} from "@/lib/saas/creation-access";
export function imagegenFingerprint(request:ImagegenRequest){return createHash("sha256").update(JSON.stringify(imagegenRequestSchema.parse(request))).digest("hex");}
export async function planImagegen(raw:ImagegenRequest,owner:string,versions?:{modelVersion:number;billingVersion:number}):Promise<ImagegenPlan>{
 await assertCurrentCreationFeature("/api/imagegen");
 const request=imagegenRequestSchema.parse(raw),skill=await resolveImageSkill(owner,request.skill),intent=resolveImagegenIntent({...request,useCase:request.useCase||skill?.useCase});
 if(intent.conflicts.length)throw new ImagegenPlanError(intent.conflicts.join("；"));
 const access=await userFeaturePolicy(owner),imageAllowed=["generate","batchshot","variations","fuse"].some(id=>allows(access,id));
 if(request.entry==="canvas"&&!allows(access,"canvas")||request.entry==="agent"&&!allows(access,"agent")||intent.operation!=="postprocess"&&!imageAllowed||intent.operation==="postprocess"&&!["canvas","works","generate"].some(id=>allows(access,id)))throw new FeatureAccessError("此图像功能尚未授权");
 if(intent.operation==="cutout"&&!allows(access,"cutout"))throw new FeatureAccessError("抠图功能尚未授权");
 if(request.output.format==="jpeg"&&(intent.background==="transparent"||!request.output.flattenColor))throw new ImagegenPlanError("JPEG不保留透明度，请选择PNG/WebP，或明确不透明背景和扁平化颜色");
 const inputs=await readImagegenInputs(request,owner);
 // Keep the caller fingerprint for retry lookup; persist the resolved frame in the frozen plan.
 const fingerprint=imagegenFingerprint(request);
 const frameRatio=automaticFrameRatio(request,inputs,intent.operation,intent.useCase);
 if(frameRatio){request.parameters.ratio=frameRatio;intent.requirements=intent.requirements.map(r=>r.name==="ratio"?{...r,value:frameRatio}:r);}
 const maskedTarget=inputs.some(input=>input.role==="mask")&&inputs.find(input=>input.role==="edit-target");
 if(maskedTarget&&request.parameters.ratio&&request.parameters.ratio!=="auto"){
  const [width,height]=request.parameters.ratio.split(":").map(Number);
  if(Math.abs(width/height-maskedTarget.width/maskedTarget.height)>0.01)throw new ImagegenPlanError("蒙版局部编辑需保留目标画面比例，请选择自适应或原图比例");
 }
 if(request.parameters.width&&request.parameters.height){
  if(Math.max(request.parameters.width,request.parameters.height)>MAX_GENERATION_DIMENSION)throw new ImagegenPlanError(`当前生成路径的实际尺寸上限为${MAX_GENERATION_DIMENSION}，请按已发布规格选择`);
  const effective=resolutionForLongSide(Math.max(request.parameters.width,request.parameters.height));
  if(request.parameters.resolution&&request.parameters.resolution!==effective)throw new ImagegenPlanError(`实际像素对应${effective}档，请调整分辨率后预览积分`);
  request.parameters.resolution=effective;
 }
 if(request.mode==="batch")throw new ImagegenPlanError("批次请使用批次执行入口");
 if(intent.operation==="postprocess"&&request.output.compressionMode==="native")throw new ImagegenPlanError("本地后处理不调用供应商，请选择本地压缩控制");
 if(intent.operation==="postprocess"&&request.inputs.some(i=>i.role==="mask"))throw new ImagegenPlanError("本地输出处理不使用蒙版，请移除蒙版或选择模型编辑");
 if(intent.operation==="postprocess")return {request,intent,fingerprint,modelVersion:0,billingVersion:0,steps:[{key:"process",operation:"postprocess",eligibleUpstreamIds:[],parameters:{},credits:0}],totalCredits:0,confirmationRequired:false,warnings:[]};
 const services=getModelExecutionServices();
 const [models,billing]=await Promise.all([versions?services.models.byVersion(versions.modelVersion):services.models.current(),versions?services.billing.byVersion(versions.billingVersion):services.billing.current()]);
 const feature=request.entry==="canvas"?"canvas.image":"image.generate";
 let id=request.modelId||featureDefaultModel(models.config,feature,"image.generate");
 id=routeImageModel(id||"",request.parameters.ratio||"1:1",models.config.publicModels.filter(m=>m.enabled&&m.modality==="image"));
 if(!id)throw new ImagegenPlanError("没有可用的生图模型，请管理员配置", "IMAGEGEN_NO_MODEL", 409);
 if(!models.config.publicModels.some(m=>m.id===id&&m.enabled&&m.visible&&m.modality==="image"))throw new ImagegenPlanError("所选模型未开放，请刷新模型列表", "IMAGEGEN_MODEL_UNAVAILABLE", 409);
 id=selectFeatureModel(models.config,{feature,binding:request.inputs.length?"image.edit":"image.generate",requestedModelId:id,requireVisible:true})!.model.id;
 const requestedQuality=request.parameters.quality||"medium";
 const qualityChoice=selectImageQuality(models.config,feature,id,requestedQuality);
 if(qualityChoice.reason){request.parameters.quality=qualityChoice.quality;intent.requirements=intent.requirements.map(r=>r.name==="quality"?{...r,value:qualityChoice.quality}:r);}
 const requestedResolution=request.parameters.resolution||"1K";
 const facts=(requirements:Intent):ModelFacts=>({task:"product",quality:request.parameters.quality||"medium",resolution:request.parameters.resolution||"1K",requestedResolution:request.parameters.resolution||"1K",ratio:request.parameters.ratio||"1:1",needsEdit:request.inputs.some(i=>i.role!=="mask"),needsMask:request.inputs.some(i=>i.role==="mask"),preserveIdentity:request.inputs.length>0,needsText:false,nativeResolution:false,references:request.inputs.filter(i=>i.role!=="mask").length,quantity:request.variants,inputLength:request.prompt.length,imagegenRequirements:requirements});
 const options={trustedOrigins:(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(/[\s,]+/).filter(Boolean)};
 const resolutionIntent=intent.background==="transparent"?{...intent,background:null,requirements:intent.requirements.filter(r=>r.name!=="background")}:intent;
 const resolutionChoice = request.parameters.width || request.parameters.height || versions ? undefined : resolveImageResolution(models.config,id,request.parameters.resolution||"1K",feature,request.parameters.ratio,{snapshot:models,billing,facts:facts(resolutionIntent),options});
 if(resolutionChoice?.changed) {
  request.parameters.resolution=resolutionChoice.effective as "1K"|"2K"|"4K";
  intent.requirements=resolutionFacts(facts(intent),resolutionChoice.effective).imagegenRequirements!.requirements;
 }
 const simulate=(modelId:string,requirements:Intent)=>simulateModel(models,billing,modelId,requirements.operation==="cutout"?{...facts(requirements),needsEdit:true,references:1,quantity:1}:facts(requirements),options);
 const steps:ImagegenPlan["steps"]=[],warnings:string[]=maskedTarget?["模型编辑后按蒙版合成，未选区保留原图；原生成版本也会保留。"]:[];
 if(qualityChoice.reason)warnings.push("本次质量标签已按模型默认档处理。");
 if(resolutionChoice?.changed)warnings.push(resolutionFallbackMessage(resolutionChoice));
 const selectedImagePresetForPlan=(modelId:string)=>selectedImagePreset(models.config,feature,modelId);
 const append=async(key:string,operation:Intent["operation"],modelId:string,requirements:Intent,featureId:"image.generate"|"canvas.image"|"tool.cutout")=>{
  const stageInputFacts=operation==="cutout"?{...facts(requirements),needsEdit:true,references:1,quantity:1}:facts(requirements);
  const binding=operation==="cutout"?"image.cutout":stageInputFacts.needsEdit?"image.edit":"image.generate";
  const preparedImage=prepareImageOperation({path:operation==="cutout"?"/api/cutout":"/api/generate-image",binding,feature:featureId,featureModel:modelId,references:stageInputFacts.references,allowResolutionFallback:!request.parameters.width&&!request.parameters.height&&!versions,
   body:{model:modelId,prompt:request.prompt,origin:featureId==="canvas.image"?"canvas":"",quality:request.parameters.quality||"medium",resolution:request.parameters.resolution||"1K",ratio:request.parameters.ratio||"1:1",needsMask:stageInputFacts.needsMask,...(request.parameters.width?{targetWidth:request.parameters.width,targetHeight:request.parameters.height}:{})},
   advanced:{intent:requirements}},models,billing);
  preparedImage.facts.quantity=operation==="cutout"?1:request.variants;
  const effectiveResolution=preparedImage.facts.requestedResolution||preparedImage.facts.resolution;
  const stageFacts={...preparedImage.facts,resolution:effectiveResolution};
  const stageResolution={requested:request.parameters.resolution||"1K",effective:effectiveResolution,supported:[],changed:effectiveResolution!==(request.parameters.resolution||"1K")};
  const candidates=simulateModel(models,billing,modelId,stageFacts,options);
  const selected=models.config.publicModels.find(m=>m.id===modelId)!;
  let exactRatioRejected=false;
  let hubRatioRejected=false;
  candidates.eligible=candidates.eligible.filter(candidate=>{
   const source=models.config.upstreamModels.find(u=>u.id===candidate.upstreamId)!;
   const provider=models.config.providers.find(p=>p.id===source.providerId);
   if(!versions && !selectedImagePresetForPlan(modelId) && !request.parameters.width && !upstreamAcceptsResolution(source,stageFacts.resolution,stageFacts.ratio)) {candidates.excluded.push({upstreamId:candidate.upstreamId,codes:["RESOLUTION_UNSUPPORTED"]});return false;}
   const codes=imageRequestAdmission(request.parameters.ratio||"1:1",modelId,!!selected.supplierRouting,source,provider?.options?.imageAdapter);
   if(codes.includes("REVERSE_HUB_RATIO_UNSUPPORTED"))hubRatioRejected=true;
   if(codes.includes("EXACT_RATIO_UNSUPPORTED"))exactRatioRejected=true;
   if(codes.length)candidates.excluded.push({upstreamId:candidate.upstreamId,codes});
   if(codes.length)return false;
   // A family may have different native wire contracts. A deficient candidate
   // is excluded before freeze; it must not reject compatible suppliers too.
   const required={inputFidelity:request.parameters.inputFidelity,moderation:request.parameters.moderation,pixelSize:request.parameters.width,outputCompression:request.output.compressionMode==="native"?request.output.compression:undefined};
   const missing=Object.entries(required).some(([key,value])=>value!==undefined&&(!source.parameterMap.imagegen?.[key as keyof NonNullable<typeof source.parameterMap.imagegen>]||source.parameterMap.imagegen[key as keyof NonNullable<typeof source.parameterMap.imagegen>]==="omit"));
   let unsupported=missing;
   if(!missing){
    try{
     const extra=mapImagegenParameters(imagegenWireRequest({...request,output:{...request.output,background:requirements.background||undefined}}),publishedImagegenCapabilities(source.capabilities),source.parameterMap.imagegen||{});
     unsupported=Object.keys(extra).length>0&&(!["openai-images","router-images"].includes(provider!.protocol)||provider?.options?.imageAdapter==="reverse-hub");
    }catch(error){if(!(error instanceof Error)||!/^实际参数/.test(error.message))throw error;unsupported=true;}
   }
   if(unsupported)candidates.excluded.push({upstreamId:candidate.upstreamId,codes:["IMAGEGEN_PARAMETER_UNSUPPORTED"]});
   return !unsupported;
  });
  if(!candidates.eligible.length){if(exactRatioRejected)throw new ExactImageSizeError(request.parameters.ratio||"1:1");if(hubRatioRejected)throw new ImagegenPlanError(REVERSE_HUB_RATIO_MESSAGE, "IMAGEGEN_RATIO_UNSUPPORTED", 422);if(operation==="cutout"&&candidates.excluded.length&&candidates.excluded.every(c=>c.codes.includes("IMAGEGEN_TRANSPARENT_UNSUPPORTED")))throw new ImagegenPlanError("当前抠图模型没有支持透明输出的可用通道，请联系管理员检查模型配置", "IMAGEGEN_CUTOUT_UNAVAILABLE", 409);throw new ImagegenPlanError("所选模型没有支持本次生成参数的可用通道，请调整参数或选择其他模型", "IMAGEGEN_NO_CHANNEL", 409);}
  const model=models.config.publicModels.find(m=>m.id===modelId)!;
  if(model.target.type==="pool"&&!model.supplierRouting&&(request.parameters.inputFidelity!==undefined||request.parameters.moderation!==undefined||request.parameters.width!==undefined||request.output.compressionMode==="native"&&request.output.compression!==undefined))throw new ImagegenPlanError("外部Router尚未开放这些原生参数的发送，请选择已发布参数映射的直连供应通道");
  assertToolScope(models.config,featureId,modelId);
  if(model.target.type!=="upstream"&&!model.supplierRouting&&candidates.excluded.length)throw new ImagegenPlanError("当前聚合通道尚不能限制高级参数候选，请管理员维护全部候选能力");
  const q=await runExecutionBundle({frozen:{modelVersion:models.version,billingVersion:billing.version},billing,models},()=>quoteForActor(owner,{feature:featureId,quantity:operation==="cutout"?1:request.variants,modelId,quality:requestedQuality,resolution:requestedResolution,ratio:request.parameters.ratio||"1:1"},{effectiveResolution:stageFacts.resolution}));
  if(stageResolution?.changed)warnings.push(resolutionFallbackMessage(stageResolution));
  const eligibleUpstreamIds=candidates.eligible.map(c=>c.upstreamId);
  preparedImage.eligibleUpstreamIds=eligibleUpstreamIds;
  if(q.requestedParameters)preparedImage.requestedParameters=q.requestedParameters;
  steps.push({key,operation,modelId,eligibleUpstreamIds,parameters:{quality:preparedImage.facts.quality,resolution:stageFacts.resolution,ratio:request.parameters.ratio||"1:1"},credits:q.tariff.pricing.mode==="api-cost-plus"?q.authorizedCredits:q.requestedCredits,billingQuote:q,preparedImage});
 };
 if(intent.operation==="cutout"){
  if(request.variants!==1)throw new ImagegenPlanError("抠图对单个目标输出一个透明版本，多个目标请使用批次");
  const cutout=featureDefaultModel(models.config,"tool.cutout","image.cutout");if(!cutout)throw new ImagegenPlanError("透明抠图模型尚未配置，请管理员维护");
  await append("cutout","cutout",cutout,intent,"tool.cutout");
 }else if(intent.background==="transparent"&&!simulate(id,intent).eligible.length){
  if(!allows(access,"cutout"))throw new FeatureAccessError("所选模型需使用抠图步骤，但抠图功能尚未授权");
  const cutout=featureDefaultModel(models.config,"tool.cutout","image.cutout");if(!cutout)throw new ImagegenPlanError("所选模型不支持原生透明，且未配置已核实的AI抠图路径；不会静默更换模型");
  const first={...intent,background:null,requirements:intent.requirements.filter(r=>r.name!=="background")};
  await append("generate",intent.operation,id,first,feature);
  for(let i=0;i<request.variants;i++)await append(`cutout-${i}`,"cutout",cutout,{...intent,operation:"cutout"},"tool.cutout");
  warnings.push("所选模型先生成，再通过后台指定的抠图模型生成透明图；两步积分已合计，原图保留。");
 }else await append("generate",intent.operation,id,intent,feature);
 return {...((qualityChoice.reason||resolutionChoice?.changed||steps.some(s=>s.parameters.resolution!==requestedResolution))?{requestedParameters:{quality:requestedQuality,resolution:requestedResolution,ratio:request.parameters.ratio||"1:1"}}:{}),channelContractVersion:1,ratioContractVersion:2,request,intent,fingerprint,modelVersion:models.version,billingVersion:billing.version,skillInstructions:skill?.instructions,steps,totalCredits:steps.reduce((n,s)=>n+s.credits,0),confirmationRequired:false,warnings};
}
