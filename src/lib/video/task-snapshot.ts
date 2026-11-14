import "server-only";
import {readTaskCompiledVideoPlan,compiledVideoRequest} from './compiled-task';
import {videoNodeConfigSchema,type CanvasVideoNode} from "../canvas/video-node-schema";
import {orderedInputSchema,videoReferenceSchema,type OrderedInput} from "./references";
import { storageKeyFromManagedUrl } from "../object-storage/runtime";
import type {VideoTaskRow} from "@/lib/video/task-types";
import type {VideoReference} from "./types";
export type PublicVideoTaskSnapshot={config:CanvasVideoNode["config"];inputs:OrderedInput[];modelVersion:number|null;billingVersion:number|null;originalPrompt:string;compiledPrompt:string;projectKey:string|null;nodeId:string|null;retryOf:string|null;byoc:boolean;workflow:{id:string|null;digest:string|null}|null;unavailableFields:string[]};
const fields=["mode","negativePrompt","durationSeconds","aspectRatio","resolution","width","height","generateAudio","watermark","providerOptions","shots","elements"] as const;
function reference(raw:VideoReference):VideoReference|null{const key=raw.storageKey||storageKeyFromManagedUrl(raw.url||"");const value={id:raw.id,kind:raw.kind,role:raw.role,artworkId:raw.artworkId,storageKey:key||undefined,url:key?`/media/${key}`:undefined,mimeType:raw.mimeType,bytes:raw.bytes,durationSeconds:raw.durationSeconds,sha256:raw.sha256,width:raw.width,height:raw.height};const parsed=videoReferenceSchema.safeParse(value);return parsed.success?parsed.data:null;}
/** Explicit user settings only. Never spread execution/provider snapshots, decrypted workflows, or raw responses. */
export function publicVideoTaskSnapshot(task:VideoTaskRow):PublicVideoTaskSnapshot{
  const params=task.parameters||{},plan=params.version===3?readTaskCompiledVideoPlan(String((params.creationScope as {actorEmail?:string}|undefined)?.actorEmail||''),task):undefined;
  const request=(plan?compiledVideoRequest(plan,task.source as never,task.idempotencyKey||task.id,task.sourceId):params.request||params) as unknown as Record<string,unknown>,bundle=params.modelExecutions as {modelVersion?:number;billingVersion?:number;video?:{publicModelId?:string}}|undefined;
  const raw:Record<string,unknown>={modelId:params.publicModelId||bundle?.video?.publicModelId||task.model,providerId:bundle?.video?"managed-video":task.providerId,prompt:typeof params.originalPrompt==="string"?params.originalPrompt:task.prompt,camera:params.camera};
  if(plan){
    raw.parameters=structuredClone(plan.requestedParameters);raw.intentPreference=params.intentPreference;raw.mode=params.legacyMode;
    if(request.shots)raw.shots=request.shots;if(request.elements)raw.elements=request.elements;
  }else for(const key of fields)if(request[key]!==undefined)raw[key]=request[key];
  if(!plan&&raw.durationSeconds===undefined&&task.seconds&&Number.isFinite(Number(task.seconds)))raw.durationSeconds=Number(task.seconds);
  const config:Record<string,unknown>={},unavailableFields:string[]=[];
  for(const [key,value] of Object.entries(raw)){if(value===undefined)continue;const field=videoNodeConfigSchema.shape[key as keyof typeof videoNodeConfigSchema.shape];const parsed=field?.safeParse(value);if(parsed?.success)config[key]=parsed.data;else unavailableFields.push(key);}
  const references=((Array.isArray(request.references)?request.references:task.videoReferences)||[]).map(item=>reference(item as VideoReference)).filter((item):item is VideoReference=>!!item);
  config.references=references;
  if(Array.isArray(config.elements))config.elements=config.elements.map((element:Record<string,unknown>)=>({...element,references:(element.references as VideoReference[]).map(reference).filter((item):item is VideoReference=>!!item)}));
  const inputs:OrderedInput[]=[];
  for(const [index,item] of (Array.isArray(request.orderedInputs)?request.orderedInputs:[]).entries()){
    const parsed=orderedInputSchema.safeParse(item);if(!parsed.success){unavailableFields.push(`orderedInputs.${index}`);continue;}const input=parsed.data;
    if(input.kind!=="text"){const ref=references.find(ref=>ref.id===input.id);const key=storageKeyFromManagedUrl(input.value)||ref?.storageKey;if(key)input.value=`/media/${key}`;else if(!input.value.startsWith("/media/")){unavailableFields.push(`orderedInputs.${index}.value`);continue;}}
    inputs.push(input);
  }
  if(!inputs.length)inputs.push(...references.map(ref=>({id:ref.id,nodeId:ref.artworkId||`inline:${ref.id}`,kind:ref.kind,role:ref.role,value:ref.url||`/media/${ref.storageKey}`})));
  const byoc=!!params.byocSnapshot;if(byoc){const settings=params.byocSettings as {inputMappings?:unknown;texts?:unknown;seeds?:unknown;numerics?:unknown}|undefined;if(settings){const mappings=videoNodeConfigSchema.shape.comfyInputs.safeParse(settings.inputMappings),overrides=videoNodeConfigSchema.shape.comfyOverrides.safeParse({texts:settings.texts,seeds:settings.seeds,numerics:settings.numerics});if(mappings.success)config.comfyInputs=mappings.data;else unavailableFields.push("comfyInputs");if(overrides.success)config.comfyOverrides=overrides.data;else unavailableFields.push("comfyOverrides");}else unavailableFields.push("comfyOverrides");const parsed=videoNodeConfigSchema.shape.comfyWorkflowId.safeParse(task.model);if(parsed.success)config.comfyWorkflowId=parsed.data;else unavailableFields.push("comfyWorkflowId");delete config.providerId;}
  if(typeof params.workflowManifestEnc==="string")config.workflowTaskId=task.id;
  for(const field of ["references","elements"] as const){const parsed=videoNodeConfigSchema.shape[field].safeParse(config[field]);if(parsed.success)config[field]=parsed.data;else {delete config[field];unavailableFields.push(field);}}
  return {config:videoNodeConfigSchema.parse(config),inputs,modelVersion:bundle?.modelVersion??null,billingVersion:task.billingQuote?.configVersion??bundle?.billingVersion??null,originalPrompt:typeof params.originalPrompt==="string"?params.originalPrompt:task.prompt,compiledPrompt:task.prompt,projectKey:typeof params.projectKey==="string"?params.projectKey:null,nodeId:typeof params.nodeId==="string"?params.nodeId:null,retryOf:typeof params.retryOf==="string"?params.retryOf:null,byoc,workflow:params.workflowManifestDigest||byoc?{id:byoc?task.model:typeof (request.workflowManifest as {workflowId?:string}|undefined)?.workflowId==="string"?(request.workflowManifest as {workflowId:string}).workflowId:null,digest:typeof params.workflowManifestDigest==="string"?params.workflowManifestDigest:null}:null,unavailableFields};
}
