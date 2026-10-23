import { z } from "zod";
import { IMAGEGEN_USE_CASES } from "./catalog";
import { referenceLabelSchema, referenceManifestError, type CanvasReferenceManifest } from "./reference-labels";
const text=z.string().trim().min(1).max(6000).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),"文字包含无效控制字符");
const resourceId=z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const hex=z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const imagegenChromaSchema=z.strictObject({
  keyColor:hex.default("#00ff00"),tolerance:z.number().int().min(0).max(255).default(12),
  autoKey:z.enum(["none","corners","border"]).default("none"),softMatte:z.boolean().default(false),
  transparentThreshold:z.number().min(0).max(255).default(12),opaqueThreshold:z.number().min(0).max(255).default(96),
  edgeFeather:z.number().min(0).max(64).default(0),edgeContract:z.number().int().min(0).max(16).default(0),spillCleanup:z.boolean().default(false),
}).refine(v=>v.transparentThreshold<v.opaqueThreshold,"不透明阈值必须高于透明阈值");
export const imagegenOutputSchema=z.strictObject({
  format:z.enum(["png","jpeg","webp"]).default("png"),compression:z.number().int().min(0).max(100).optional(),
  compressionMode:z.enum(["local","native"]).optional(),
  background:z.enum(["transparent","opaque"]).optional(),backgroundOrigin:z.enum(["current-ui","inherited","skill"]).optional(),
  flattenColor:hex.optional(),downscaleMaxDim:z.number().int().min(64).max(8192).optional(),
  name:z.string().trim().min(1).max(100).regex(/^[^/\\\u0000-\u001f]+$/).optional(),
});
export const imagegenRequestSchema=z.strictObject({
  version:z.literal(1),operationId:z.uuid(),entry:z.enum(["agent","canvas","workbench"]),
  mode:z.enum(["generate","edit","batch","postprocess"]),prompt:text,
  useCase:z.enum(IMAGEGEN_USE_CASES.map(x=>x.id) as [typeof IMAGEGEN_USE_CASES[number]["id"],...typeof IMAGEGEN_USE_CASES[number]["id"][]]).optional(),
  skill:z.strictObject({id:z.string().regex(/^(official:[a-z-]+|personal:[a-f0-9-]{36})$/),revision:z.number().int().positive()}).optional(),
  augment:z.boolean().default(false),modelId:resourceId.optional(),sourceNodeId:resourceId.optional(),
  inputs:z.array(z.strictObject({artworkId:resourceId,role:z.enum(["edit-target","reference","insert","style","mask"]),reference:referenceLabelSchema.optional(),originalArtworkId:resourceId.optional(),inputVariant:z.enum(['original','processed']).optional()})).max(32).default([]),
  frameSourceId:resourceId.optional(),
  framePolicy:z.literal("all-inputs").optional(),
  parameters:z.strictObject({quality:resourceId.optional(),resolution:resourceId.optional(),ratio:z.union([z.literal("auto"),z.string().regex(/^[1-9]\d{0,5}:[1-9]\d{0,5}$/)]).optional(),
    width:z.number().int().min(64).max(8192).optional(),height:z.number().int().min(64).max(8192).optional(),
    inputFidelity:resourceId.optional(),moderation:resourceId.optional()}).default({}),
  output:imagegenOutputSchema.default({format:"png"}),variants:z.number().int().min(1).max(4).default(1),
  batch:z.strictObject({items:z.array(z.strictObject({key:resourceId,name:z.string().trim().min(1).max(100),prompt:text})).min(1).max(100),
    concurrency:z.number().int().min(1).max(5).default(5),maxAttempts:z.number().int().min(1).max(3).default(3),failFast:z.boolean().default(false)}).optional(),
  chroma:imagegenChromaSchema.optional(),
}).superRefine((v,ctx)=>{
  const issue=(message:string,path:string[])=>ctx.addIssue({code:"custom",message,path});
  const targets=v.inputs.filter(i=>i.role==="edit-target"),masks=v.inputs.filter(i=>i.role==="mask");
  if(v.frameSourceId&&!v.inputs.some(i=>i.artworkId===v.frameSourceId&&i.role!=="mask"))issue("画幅来源必须是本次引用的图片",["frameSourceId"]);
  if(v.inputs.some(i=>i.reference)){
    const refs=v.inputs.filter(i=>i.role!=="mask");
    if(refs.some(i=>!i.reference))issue("参考图片编号信息不完整",["inputs"]);
    else {
      const error=referenceManifestError(v.prompt,refs.map(i=>({...i.reference!,role:i.role})) as CanvasReferenceManifest);
      if(error)issue(error,["inputs"]);
      for(const item of v.batch?.items||[]){const error=referenceManifestError(item.prompt,refs.map(i=>({...i.reference!,role:i.role})) as CanvasReferenceManifest);if(error)issue(error,["batch"]);}
    }
  }
  if(["edit","postprocess"].includes(v.mode)&&!targets.length)issue("请选择编辑目标",["inputs"]);
  if(masks.length>1||masks.length&&!targets.length)issue("蒙版必须对应一个明确编辑目标",["inputs"]);
  if(v.mode==="batch"&&!v.batch)issue("批次缺少子项",["batch"]);
  if(v.mode!=="batch"&&v.batch)issue("只有批次模式允许独立子项",["batch"]);
  if(v.batch&&new Set(v.batch.items.map(i=>i.key)).size!==v.batch.items.length)issue("批次子项编号重复",["batch"]);
  if((v.parameters.width===undefined)!==(v.parameters.height===undefined))issue("实际像素需同时填写宽高",["parameters"]);
  if(v.parameters.width&&v.parameters.height&&v.parameters.width*v.parameters.height>40_000_000)issue("像素数超过处理限制",["parameters"]);
});
