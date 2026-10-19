import "server-only";
import {createHash} from "node:crypto";
import {imagegenRequestSchema} from "./schema";
import {resolveImagegenIntent} from "./intent";
import {readImagegenInputs} from "./inputs";
import { automaticFrameRatio } from "./frame-ratio";
import { imageRequestAdmission } from "./request-admission";
import { ExactImageSizeError } from "./request-size";
import {getModelAdministration} from "../model-config/server";
import {simulateModel} from "../model-config/runtime";
import {assertToolScope,featureDefaultModel} from "../model-config/tool-scope";
import {MAX_GENERATION_DIMENSION,resolutionForLongSide} from "../mock-data";
import {routeImageModel} from "../image-model-routing";
import {quoteForActor} from "../billing/server";
import {runExecutionBundle} from "../model-config/context";
import {resolveImageSkill} from "../image-skills/server";
import {mapImagegenParameters,imagegenWireRequest} from "./parameters";
import {publishedImagegenCapabilities} from "./capabilities";
import type {ImagegenRequest,ImagegenPlan,Intent} from "./types";
import type {ModelFacts} from "../model-config/types";
import {userFeaturePolicy,FeatureAccessError} from "../feature-access/server";
import {allows} from "../feature-access/catalog";
export function imagegenFingerprint(request:ImagegenRequest){return createHash("sha256").update(JSON.stringify(imagegenRequestSchema.parse(request))).digest("hex");}
export async function planImagegen(raw:ImagegenRequest,owner:string,versions?:{modelVersion:number;billingVersion:number}):Promise<ImagegenPlan>{
 const request=imagegenRequestSchema.parse(raw),skill=await resolveImageSkill(owner,request.skill),intent=resolveImagegenIntent({...request,useCase:request.useCase||skill?.useCase});
 if(intent.conflicts.length)throw new Error(intent.conflicts.join("；"));
 const access=await userFeaturePolicy(owner),imageAllowed=["generate","batchshot","variations","fuse"].some(id=>allows(access,id));
 if(request.entry==="canvas"&&!allows(access,"canvas")||request.entry==="agent"&&!allows(access,"agent")||intent.operation!=="postprocess"&&!imageAllowed||intent.operation==="postprocess"&&!["canvas","works","generate"].some(id=>allows(access,id)))throw new FeatureAccessError("此图像功能尚未授权");
 if(intent.operation==="cutout"&&!allows(access,"cutout"))throw new FeatureAccessError("抠图功能尚未授权");
 if(request.output.format==="jpeg"&&(intent.background==="transparent"||!request.output.flattenColor))throw new Error("JPEG不保留透明度，请选择PNG/WebP，或明确不透明背景和扁平化颜色");
 const inputs=await readImagegenInputs(request,owner);
 // Keep the caller fingerprint for retry lookup; persist the resolved frame in the frozen plan.
 const fingerprint=imagegenFingerprint(request);
 const frameRatio=automaticFrameRatio(request,inputs,intent.operation,intent.useCase);
 if(frameRatio){request.parameters.ratio=frameRatio;intent.requirements=intent.requirements.map(r=>r.name==="ratio"?{...r,value:frameRatio}:r);}
 const maskedTarget=inputs.some(input=>input.role==="mask")&&inputs.find(input=>input.role==="edit-target");
 if(maskedTarget&&request.parameters.ratio&&request.parameters.ratio!=="auto"){
  const [width,height]=request.parameters.ratio.split(":").map(Number);
  if(Math.abs(width/height-maskedTarget.width/maskedTarget.height)>0.01)throw new Error("蒙版局部编辑需保留目标画面比例，请选择自适应或原图比例");
 }
 if(request.parameters.width&&request.parameters.height){
  if(Math.max(request.parameters.width,request.parameters.height)>MAX_GENERATION_DIMENSION)throw new Error(`当前生成路径的实际尺寸上限为${MAX_GENERATION_DIMENSION}，请按已发布规格选择`);
  const effective=resolutionForLongSide(Math.max(request.parameters.width,request.parameters.height));
  if(request.parameters.resolution&&request.parameters.resolution!==effective)throw new Error(`实际像素对应${effective}档，请调整分辨率后预览积分`);
  request.parameters.resolution=effective;
 }
 if(request.mode==="batch")throw new Error("批次请使用批次执行入口");
 if(intent.operation==="postprocess"&&request.output.compressionMode==="native")throw new Error("本地后处理不调用供应商，请选择本地压缩控制");
 if(intent.operation==="postprocess"&&request.inputs.some(i=>i.role==="mask"))throw new Error("本地输出处理不使用蒙版，请移除蒙版或选择模型编辑");
 if(intent.operation==="postprocess")return {request,intent,fingerprint,modelVersion:0,billingVersion:0,steps:[{key:"process",operation:"postprocess",eligibleUpstreamIds:[],parameters:{},credits:0}],totalCredits:0,confirmationRequired:false,warnings:[]};
 const admin=await getModelAdministration();
 const [models,billing]=await Promise.all([versions?admin.repo.byVersion(versions.modelVersion):admin.repo.current(),versions?admin.billing.byVersion(versions.billingVersion):admin.billing.current()]);
 const feature=request.entry==="canvas"?"canvas.image":"image.generate";
 let id=request.modelId||featureDefaultModel(models.config,feature,"image.generate");
 id=routeImageModel(id||"",request.parameters.ratio||"1:1",models.config.publicModels.filter(m=>m.enabled&&m.modality==="image"));
 if(!id)throw new Error("没有可用的生图模型，请管理员配置");
 if(!models.config.publicModels.some(m=>m.id===id&&m.enabled&&m.visible&&m.modality==="image"))throw new Error("所选模型未开放，请刷新模型列表");
 assertToolScope(models.config,feature,id);
 const facts=(requirements:Intent):ModelFacts=>({task:"product",quality:request.parameters.quality||"medium",resolution:request.parameters.resolution||"1K",requestedResolution:request.parameters.resolution||"1K",ratio:request.parameters.ratio||"1:1",needsEdit:request.inputs.some(i=>i.role!=="mask"),needsMask:request.inputs.some(i=>i.role==="mask"),preserveIdentity:request.inputs.length>0,needsText:false,nativeResolution:false,references:request.inputs.filter(i=>i.role!=="mask").length,quantity:request.variants,inputLength:request.prompt.length,imagegenRequirements:requirements});
 const simulate=(modelId:string,requirements:Intent)=>simulateModel(models,billing,modelId,requirements.operation==="cutout"?{...facts(requirements),needsEdit:true,references:1,quantity:1}:facts(requirements),{trustedOrigins:(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(/[\s,]+/).filter(Boolean)});
 const steps:ImagegenPlan["steps"]=[],warnings:string[]=maskedTarget?["模型编辑后按蒙版合成，未选区保留原图；原生成版本也会保留。"]:[];
 const append=async(key:string,operation:Intent["operation"],modelId:string,requirements:Intent,featureId:"image.generate"|"canvas.image"|"tool.cutout")=>{
  const candidates=simulate(modelId,requirements);
  const selected=models.config.publicModels.find(m=>m.id===modelId)!;
  let exactRatioRejected=false;
  candidates.eligible=candidates.eligible.filter(candidate=>{
   const source=models.config.upstreamModels.find(u=>u.id===candidate.upstreamId)!;
   const codes=imageRequestAdmission(request.parameters.ratio||"1:1",modelId,!!selected.supplierRouting,source);
   if(codes.includes("EXACT_RATIO_UNSUPPORTED"))exactRatioRejected=true;
   if(codes.length)candidates.excluded.push({upstreamId:candidate.upstreamId,codes});
   return !codes.length;
  });
  if(!candidates.eligible.length){if(exactRatioRejected)throw new ExactImageSizeError(request.parameters.ratio||"1:1");throw new Error("所选模型没有已核实支持本次参数的通道；请管理员维护能力，或选择其他模型");}
  if(operation==="cutout"&&candidates.eligible.some(c=>publishedImagegenCapabilities(models.config.upstreamModels.find(u=>u.id===c.upstreamId)!.capabilities).transparent?.state!=="supported"))throw new Error("抠图通道尚未核实透明输出能力");
  const model=models.config.publicModels.find(m=>m.id===modelId)!;
  if(model.target.type==="pool"&&!model.supplierRouting&&(request.parameters.inputFidelity!==undefined||request.parameters.moderation!==undefined||request.parameters.width!==undefined||request.output.compressionMode==="native"&&request.output.compression!==undefined))throw new Error("外部Router尚未开放这些原生参数的发送，请选择已发布参数映射的直连供应通道");
  assertToolScope(models.config,featureId,modelId);
  if(model.target.type!=="upstream"&&!model.supplierRouting&&candidates.excluded.length)throw new Error("当前聚合通道尚不能限制高级参数候选，请管理员维护全部候选能力");
  for(const c of candidates.eligible){const u=models.config.upstreamModels.find(u=>u.id===c.upstreamId)!;for(const [key,value] of Object.entries({inputFidelity:request.parameters.inputFidelity,moderation:request.parameters.moderation,pixelSize:request.parameters.width,outputCompression:request.output.compressionMode==="native"?request.output.compression:undefined})){if(value!==undefined&&(!u.parameterMap.imagegen?.[key as keyof NonNullable<typeof u.parameterMap.imagegen>]||u.parameterMap.imagegen[key as keyof NonNullable<typeof u.parameterMap.imagegen>]==="omit"))throw new Error("本次指定的原生参数尚未开放发送，请管理员维护参数映射");}
   const extra=mapImagegenParameters(imagegenWireRequest({...request,output:{...request.output,background:requirements.background||undefined}}),publishedImagegenCapabilities(u.capabilities),u.parameterMap.imagegen||{});const provider=models.config.providers.find(p=>p.id===u.providerId)!;if(Object.keys(extra).length&&(!["openai-images","router-images"].includes(provider.protocol)||provider.options?.imageAdapter==="reverse-hub"))throw new Error("该供应协议尚未实现所选实际参数的发送，请选择已实现参数映射的通道");}
  const q=await runExecutionBundle({frozen:{modelVersion:models.version,billingVersion:billing.version},billing},()=>quoteForActor(owner,{feature:featureId,quantity:operation==="cutout"?1:request.variants,modelId,quality:request.parameters.quality||"medium",resolution:request.parameters.resolution||"1K",ratio:request.parameters.ratio||"1:1"}));
  steps.push({key,operation,modelId,eligibleUpstreamIds:candidates.eligible.map(c=>c.upstreamId),parameters:{quality:request.parameters.quality||"medium",resolution:request.parameters.resolution||"1K",ratio:request.parameters.ratio||"1:1"},credits:q.tariff.pricing.mode==="api-cost-plus"?q.authorizedCredits:q.requestedCredits});
 };
 if(intent.operation==="cutout"){
  if(request.variants!==1)throw new Error("抠图对单个目标输出一个透明版本，多个目标请使用批次");
  const cutout=models.config.bindings["image.cutout"];if(!cutout)throw new Error("透明抠图模型尚未配置，请管理员维护");
  await append("cutout","cutout",cutout,intent,"tool.cutout");
 }else if(intent.background==="transparent"&&!simulate(id,intent).eligible.length){
  if(!allows(access,"cutout"))throw new FeatureAccessError("所选模型需使用抠图步骤，但抠图功能尚未授权");
  const cutout=models.config.bindings["image.cutout"];if(!cutout)throw new Error("所选模型不支持原生透明，且未配置已核实的AI抠图路径；不会静默更换模型");
  const first={...intent,background:null,requirements:intent.requirements.filter(r=>r.name!=="background")};
  await append("generate",intent.operation,id,first,feature);
  for(let i=0;i<request.variants;i++)await append(`cutout-${i}`,"cutout",cutout,{...intent,operation:"cutout"},"tool.cutout");
  warnings.push("所选模型先生成，再通过后台指定的抠图模型生成透明图；两步积分已合计，原图保留。");
 }else await append("generate",intent.operation,id,intent,feature);
 return {ratioContractVersion:1,request,intent,fingerprint,modelVersion:models.version,billingVersion:billing.version,skillInstructions:skill?.instructions,steps,totalCredits:steps.reduce((n,s)=>n+s.credits,0),confirmationRequired:steps.length>1||steps.some(s=>s.credits>=100),warnings};
}

