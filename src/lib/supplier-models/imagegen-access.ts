import "server-only";
import type { Pool } from "pg";
import type { ModelConfig } from "../model-config/types";
import { supplierMetadataSchema } from "./types";
import { imagegenMetadataSchema,resolveImagegenCapabilities } from "../imagegen/capabilities";
import { specificationImagegen } from "./specifications";
export async function readImagegenDefaults(pool:Pool,config:ModelConfig){
  const targets=config.upstreamModels.filter(u=>u.modality==="image").map(u=>({provider_id:u.providerId,model_id:u.model}));
  if(!targets.length)return new Map();
  const rows=(await pool.query("SELECT m.* FROM app_supplier_model_metadata m JOIN jsonb_to_recordset($1::jsonb) AS t(provider_id text,model_id text) ON m.provider_id=t.provider_id AND m.model_id=t.model_id",[JSON.stringify(targets)])).rows;
  return new Map(config.upstreamModels.filter(u=>u.modality==="image").map(u=>{
    const row=rows.find(r=>r.provider_id===u.providerId&&r.model_id===u.model);
    if(!row)return [u.id,null] as const;
    const metadata=supplierMetadataSchema.parse(row.metadata),manual=imagegenMetadataSchema.safeParse(metadata.parameterMetadata.imagegen),supplier=specificationImagegen(metadata.parameterMetadata.supplierSpecification);
    return [u.id,{metadataRef:{id:String(row.id),revision:Number(row.revision)},capabilities:resolveImagegenCapabilities(manual.success?manual.data.capabilities:undefined,supplier.capabilities),wireMap:{...supplier.wireMap,...(manual.success?manual.data.wireMap:{})}}] as const;
  }));
}
