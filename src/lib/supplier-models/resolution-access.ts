import "server-only";
import type {Pool} from "pg";
import type {ModelConfig} from "../model-config/types";
import {ensureSupplierModels} from "./schema";
import {supplierMetadataSchema} from "./types";
import {metadataResolutionDefaults} from "./resolution-defaults";
export async function readResolutionDefaults(pool:Pool,config:ModelConfig){
  await ensureSupplierModels(pool);
  const targets=config.upstreamModels.filter(u=>u.modality==="image").map(u=>({provider_id:u.providerId,model_id:u.model}));
  const rows=(await pool.query("SELECT m.* FROM app_supplier_model_metadata m JOIN jsonb_to_recordset($1::jsonb) AS t(provider_id text,model_id text) ON m.provider_id=t.provider_id AND m.model_id=t.model_id",[JSON.stringify(targets)])).rows;
  return new Map(config.upstreamModels.map(u=>{const r=rows.find(r=>r.provider_id===u.providerId&&r.model_id===u.model);return [u.id,r?metadataResolutionDefaults({...supplierMetadataSchema.parse(r.metadata),id:r.id,providerId:r.provider_id,providerName:r.provider_name,modelId:r.model_id,label:r.label,catalogOwner:r.catalog_owner,revision:Number(r.revision),lastSeenAt:"",updatedAt:""}):null] as const;}));
}
