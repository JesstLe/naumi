import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
import {createHash,randomInt} from "node:crypto";
import {getActiveComfyEndpoint, getComfyWorkflow} from "../db";
import {getPool} from "@/platform/db/pool";
import {createCredentialStore} from "../model-config/credentials";
import {ModelConfigError} from "../model-config/types";
import {modelEndpointFetch} from "../model-config/transport";
import {assertComfyEndpointAllowed} from "../comfyui/client";
import {extractWorkflowInputs,applyWorkflowOverrides,missingNodes,type ApiWorkflow} from "../comfyui/workflow";
import {readBounded} from "../supplier-cost/io";
import {encryptAtRest} from "../settings";
import {videoWorkflowManifestSchema,type VideoWorkflowManifest} from "./workflow-schema";
import type {VideoProviderRuntimeConfig} from "./providers/config";
import type {VideoReference} from "./types";
import type {VideoByocOverrides} from "./byoc-settings";
type RecipeInput=VideoByocOverrides&{workflowId:string;prompt?:string;seed?:number;numericDefaults?:Record<string,number>;references?:VideoReference[];inputMappings?:VideoWorkflowManifest["inputs"]};
export type FrozenByocRecipe={actor:string;workflowId:string;config:VideoProviderRuntimeConfig;manifest:VideoWorkflowManifest;snapshot:string;settings:{workflowId:string;inputMappings:VideoWorkflowManifest["inputs"];texts?:Record<string,string>;seeds:Record<string,number>;numerics:Record<string,Record<string,number>>}};
const recipes=new AsyncLocalStorage<FrozenByocRecipe>();
export function runFrozenByocRecipe<T>(recipe:FrozenByocRecipe,run:()=>Promise<T>){return recipes.run(recipe,run);}
export async function prepareByocRecipe(actorRaw:string,input:RecipeInput):Promise<FrozenByocRecipe>{
  const actor=actorRaw.toLowerCase(),frozen=recipes.getStore();if(frozen){if(frozen.actor!==actor||frozen.workflowId!==input.workflowId)throw new ModelConfigError("BYOC_OWNER_MISMATCH","冻结工作流归属不一致",403);return frozen;}
  const [endpoint,workflow]=await Promise.all([getActiveComfyEndpoint(actor),getComfyWorkflow(actor,input.workflowId)]);if(!endpoint||!workflow)throw new ModelConfigError("BYOC_WORKFLOW_UNAVAILABLE","自备端点或工作流不存在",404);
  const baseUrl=await assertComfyEndpointAllowed(endpoint.baseUrl),api=workflow.apiJson as ApiWorkflow,slots=extractWorkflowInputs(api),trustedOrigins=(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(/[\s,]+/).filter(Boolean);
  if(process.env.USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK==="true"||process.env.NODE_ENV!=="production")trustedOrigins.push(new URL(baseUrl).origin);
  const response=await modelEndpointFetch(baseUrl,{trustedOrigins})(`${baseUrl}/object_info`,{headers:endpoint.apiKey?{authorization:`Bearer ${endpoint.apiKey}`}:{},signal:AbortSignal.timeout(20000)});if(!response.ok){await response.body?.cancel();throw new ModelConfigError("BYOC_ENDPOINT_UNAVAILABLE","自备端点暂时不可用",503);}const info=JSON.parse(await readBounded(response,2*1024*1024)),missing=missingNodes(slots.requiredNodes,Object.keys(info));if(missing.length)throw new ModelConfigError("BYOC_NODES_MISSING",`缺少工作流节点：${missing.join(", ")}`,422);
  const positive=slots.texts.filter(slot=>slot.role==="positive"),targets=positive.length?positive:slots.texts.length===1?slots.texts:[],texts={...(input.prompt?Object.fromEntries(targets.map(slot=>[slot.nodeId,input.prompt!])):{}),...input.texts},seeds:Record<string,number>={},numerics:Record<string,Record<string,number>>={};
  for(const key of Object.keys(input.texts||{}))if(!slots.texts.some(slot=>slot.nodeId===key))throw new ModelConfigError("INVALID_BYOC_TEXT","工作流文本节点不存在",422);
  for(const key of Object.keys(input.seeds||{}))if(!slots.seeds.some(slot=>slot.nodeId===key))throw new ModelConfigError("INVALID_BYOC_SEED","工作流种子节点不存在",422);
  for(const slot of slots.seeds)seeds[slot.nodeId]=input.seeds?.[slot.nodeId]??input.seed??randomInt(0,2**48-1);
  for(const [nodeId,fields] of Object.entries(input.numerics||{}))for(const [field,value] of Object.entries(fields))if(!slots.numerics.some(slot=>slot.nodeId===nodeId&&slot.field===field)||!Number.isInteger(value)||value<=0)throw new ModelConfigError("INVALID_BYOC_NUMERIC","工作流数值无效",422);
  for(const [field,value] of Object.entries(input.numericDefaults||{}))if(!slots.numerics.some(slot=>slot.field===field)||!Number.isInteger(value)||value<=0)throw new ModelConfigError("INVALID_BYOC_NUMERIC","工作流默认数值无效",422);
  for(const slot of slots.numerics){const value=input.numerics?.[slot.nodeId]?.[slot.field]??input.numericDefaults?.[slot.field];if(value!==undefined)numerics[slot.nodeId]={...numerics[slot.nodeId],[slot.field]:value};}
  const template=applyWorkflowOverrides(api,{texts,seeds,numerics});for(const slot of slots.texts)if(texts[slot.nodeId]!==undefined)template[slot.nodeId].inputs.text=texts[slot.nodeId];
  const inputs=input.inputMappings||slots.images.map((slot,index)=>({name:`image-${slot.nodeId}`,type:"image" as const,path:[slot.nodeId,"inputs","image"],index:input.references?.filter(ref=>ref.kind==="image").length===1?0:index,required:true})),manifest=videoWorkflowManifestSchema.parse({version:1,kind:"comfyui",workflowId:workflow.id,template,inputs});
  const providerId=`byoc-video:${createHash("sha256").update(`${actor}:${endpoint.id}`).digest("hex").slice(0,40)}`,config:VideoProviderRuntimeConfig={id:providerId,label:"自备 ComfyUI",protocol:"comfyui",videoProfile:"comfyui",baseUrl,apiKey:endpoint.apiKey,models:[workflow.id],defaultModel:workflow.id,idempotencyStrategy:"none"},credentialRef=endpoint.apiKey?(await createCredentialStore(getPool()).importPlain({providerId,plain:endpoint.apiKey,actor})).id:undefined;
  const snapshot=encryptAtRest(JSON.stringify({actor,providerId,endpointId:endpoint.id,baseUrl,credentialRef,manifest}));return {actor,workflowId:workflow.id,config,manifest,snapshot,settings:{workflowId:workflow.id,inputMappings:inputs,texts,seeds,numerics}};
}
