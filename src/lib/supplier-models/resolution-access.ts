import { readImageModelMetadata } from "./image-model-metadata";
import type { QueryResultRow } from "pg";
import "server-only";
import type {Pool} from "pg";
import type {ModelConfig} from "../model-config/types";
import {supplierMetadataSchema} from "./types";
import {metadataResolutionDefaults} from "./resolution-defaults";
export async function readResolutionDefaults(pool:Pool,config:ModelConfig, metadataRows?: readonly QueryResultRow[]){
  const rows=metadataRows ?? await readImageModelMetadata(pool,config);
  const byModel=new Map(rows.map(row=>[JSON.stringify([row.provider_id,row.model_id]),row]));
  return new Map(config.upstreamModels.map(u=>{const r=byModel.get(JSON.stringify([u.providerId,u.model]));return [u.id,r?metadataResolutionDefaults({...supplierMetadataSchema.parse(r.metadata),id:r.id,providerId:r.provider_id,providerName:r.provider_name,modelId:r.model_id,label:r.label,catalogOwner:r.catalog_owner,revision:Number(r.revision),lastSeenAt:"",updatedAt:""}):null] as const;}));
}
