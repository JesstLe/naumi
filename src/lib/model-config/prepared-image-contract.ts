import {z} from "zod";
import {factsSchema,imageUpstreamIdsSchema} from "./execution-contract";
import {ModelConfigError,type ModelSnapshot} from "./types";
import type {ConfigSnapshot} from "../billing/types";

export const preparedImageSchema=z.strictObject({version:z.literal(1),modelVersion:z.number().int().positive(),billingVersion:z.number().int().positive(),modelDigest:z.string().regex(/^[a-f0-9]{64}$/),feature:z.string().optional(),binding:z.enum(["image.generate","image.edit","image.cutout"]),modelId:z.string().min(1),facts:factsSchema,requestedParameters:z.object({quality:z.string(),resolution:z.string(),ratio:z.string()}).optional(),eligibleUpstreamIds:imageUpstreamIdsSchema.optional()});
export type PreparedImageOperation=z.infer<typeof preparedImageSchema>;
export function validatePreparedImage(raw:PreparedImageOperation,snapshot:ModelSnapshot,billing:ConfigSnapshot,feature?:string,binding?:string){
  const p=preparedImageSchema.parse(raw);
  if(p.modelVersion!==snapshot.version||p.billingVersion!==billing.version||p.modelDigest!==snapshot.digest||p.feature!==feature||p.binding!==binding)throw new ModelConfigError("EXECUTION_MISMATCH","准备方案与冻结版本不一致",503);
  return p;
}
