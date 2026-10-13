import { z } from "zod";
import { imagegenCapabilitySetSchema,imagegenWireMapSchema } from "../imagegen/capabilities";
import type { ModelConfig } from "./types";
import { ModelConfigError } from "./types";
export const imagegenRoutePolicySchema=z.strictObject({upstreamId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/),
  capabilities:imagegenCapabilitySetSchema,wireMap:imagegenWireMapSchema,
  metadataRef:z.strictObject({id:z.uuid(),revision:z.number().int().positive()}).nullable().optional()});
export type ImagegenRoutePolicy=z.infer<typeof imagegenRoutePolicySchema>;
export function applyImagegenModelParameters(source:ModelConfig,ids:string[],routes:ImagegenRoutePolicy[]|null):ModelConfig{
  if(routes&&(routes.length!==ids.length||new Set(routes.map(r=>r.upstreamId)).size!==ids.length||routes.some(r=>!ids.includes(r.upstreamId))))throw new ModelConfigError("INVALID_REQUEST","请配置该家族全部实际模型来源",400);
  const config=structuredClone(source);
  for(const id of ids){const u=config.upstreamModels.find(u=>u.id===id);if(!u||u.modality!=="image")throw new ModelConfigError("MODEL_UNAVAILABLE","图片来源不存在",400);
    if(routes){const row=imagegenRoutePolicySchema.parse(routes.find(r=>r.upstreamId===id));u.capabilities.imagegen=structuredClone(row.capabilities);u.parameterMap.imagegen=structuredClone(row.wireMap);}
    else{delete u.capabilities.imagegen;delete u.parameterMap.imagegen;}
  }
  return config;
}
