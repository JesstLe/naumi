import { z } from "zod";
import { videoDefinitionSchema, videoWireProfileSchema, type VideoModelDefinition, type VideoWireProfile } from "../video/capability-schema";
import { ModelConfigError, type ModelConfig } from "./types";
import type { ManagedModelRow } from "./management";
import {publishedVideoExecutionSchema,type PublishedVideoExecution} from '../video/published-execution';

export const videoParametersSchema = z.array(z.strictObject({
  upstreamId:z.string().min(1).max(100), definition:videoDefinitionSchema.optional(), profile:videoWireProfileSchema.nullable().optional(),execution:publishedVideoExecutionSchema.nullable().optional(),executionOnly:z.literal(true).optional(),
})).min(1).max(100);
export type VideoParameters = z.infer<typeof videoParametersSchema>;
export type VideoConfiguration = { routes:{upstreamId:string;model:string;provider:string;definition?:VideoModelDefinition;profile?:VideoWireProfile;execution?:PublishedVideoExecution;executionCandidate?:PublishedVideoExecution;candidateProfile?:VideoWireProfile;
  effective?:VideoModelDefinition;sources?:Record<string,string>;frozenRecorded?:false;sourceRevision?:{id:string;revision:number;sourceUrl:string;collectedAt:string}|null}[] };

export function applyVideoParameters(source:ModelConfig,row:ManagedModelRow,raw:VideoParameters):ModelConfig {
  if(row.modality!=="video")throw new ModelConfigError("MODEL_INCOMPATIBLE","只有视频模型可设置视频能力");
  const input=videoParametersSchema.parse(raw), ids=[...new Set(row.routes.map(route=>route.upstreamId))];
  if(new Set(input.map(route=>route.upstreamId)).size!==input.length || input.length!==ids.length || input.some(route=>!ids.includes(route.upstreamId)))
    throw new ModelConfigError("INVALID_CONFIG","视频设置须包含当前全部实际通道且不能重复，请刷新后重试");
  const config=structuredClone(source);
  for(const item of input){
    const upstream=config.upstreamModels.find(model=>model.id===item.upstreamId)!;
    if(!item.executionOnly){if(item.definition!==undefined)upstream.capabilities.video=item.definition;else delete upstream.capabilities.video;}
    if(item.profile===null)delete upstream.parameterMap.videoProfile;
    else if(item.profile!==undefined)upstream.parameterMap.videoProfile=item.profile;else if(!item.executionOnly)delete upstream.parameterMap.videoProfile;
    if(item.execution===null)delete upstream.parameterMap.videoExecution;
    else if(item.execution!==undefined)upstream.parameterMap.videoExecution=item.execution;
    if(!item.executionOnly&&typeof item.definition?.limits?.images==="number")upstream.capabilities.maxReferenceImages=item.definition.limits.images;
  }
  return config;
}
