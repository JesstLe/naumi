import { readImageModelMetadata } from "./image-model-metadata";
import type { QueryResultRow } from "pg";
import "server-only";
import type { Pool } from "pg";
import type { ModelConfig } from "../model-config/types";
import { supplierMetadataSchema } from "./types";
import { imagegenMetadataSchema,resolveImagegenCapabilities } from "../imagegen/capabilities";
import { collectedImagegenDefaults } from "./specifications";
export async function readImagegenDefaults(pool:Pool,config:ModelConfig, metadataRows?: readonly QueryResultRow[]){
  const rows=metadataRows ?? await readImageModelMetadata(pool,config);
  const byModel=new Map(rows.map(row=>[JSON.stringify([row.provider_id,row.model_id]),row]));
  return new Map(config.upstreamModels.filter(u=>u.modality==="image").map(u=>{
    const row=byModel.get(JSON.stringify([u.providerId,u.model]));
    if(!row)return [u.id,null] as const;
    const metadata=supplierMetadataSchema.parse(row.metadata),manual=imagegenMetadataSchema.safeParse(metadata.parameterMetadata.imagegen),supplier=collectedImagegenDefaults(metadata.parameterMetadata);
    return [u.id,{metadataRef:{id:String(row.id),revision:Number(row.revision)},capabilities:resolveImagegenCapabilities(manual.success?manual.data.capabilities:undefined,supplier.capabilities),wireMap:{...supplier.wireMap,...(manual.success?manual.data.wireMap:{})}}] as const;
  }));
}
