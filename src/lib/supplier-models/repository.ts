import "server-only";
import {createHash,randomUUID} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {ensureSupplierModels} from "./schema";
import {supplierMetadataSchema,unknownSupplierMetadata,type SupplierMetadata,type SupplierModelRecord} from "./types";
import type {ModelConfig,ModelProvider} from "../model-config/types";
import type {ProviderCatalogModel} from "../model-config/catalog";
import {imageModelDisplayId} from "../image-model-routing";

export class SupplierMetadataError extends Error{constructor(public code:string,message:string,public status=400){super(message);}}
const serial=(v:unknown):string=>JSON.stringify(v&&typeof v==="object"?Array.isArray(v)?v.map(x=>JSON.parse(serial(x))):Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,JSON.parse(serial(x))])):v);
const record=(r:any):SupplierModelRecord=>({...supplierMetadataSchema.parse(r.metadata),id:r.id,providerId:r.provider_id,providerName:r.provider_name,modelId:r.model_id,label:r.label,catalogOwner:r.catalog_owner,revision:Number(r.revision),lastSeenAt:new Date(r.last_seen_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()});
async function writePrices(tx:PoolClient,id:string,metadata:SupplierMetadata){
 await tx.query("DELETE FROM app_supplier_model_price_points WHERE model_id=$1",[id]);
 for(const p of metadata.prices)await tx.query(`INSERT INTO app_supplier_model_price_points(model_id,id,quality,resolution,basis,currency,amount_micros,input_micros_per_million,output_micros_per_million,cached_input_micros_per_million,image_input_micros_per_million,price) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,[id,p.id,p.quality,p.resolution,p.basis,p.currency,p.amountMicros,p.inputMicrosPerMillion,p.outputMicrosPerMillion,p.cachedInputMicrosPerMillion,p.imageInputMicrosPerMillion,JSON.stringify(p)]);
}
async function insert(tx:PoolClient,p:ModelProvider,model:ProviderCatalogModel,metadata:SupplierMetadata){
 const parsed=supplierMetadataSchema.parse(metadata);
 const row=(await tx.query(`INSERT INTO app_supplier_model_metadata(id,provider_id,provider_name,model_id,label,catalog_owner,family,brand,modality,capability_state,metadata,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'system-import') ON CONFLICT(provider_id,model_id) DO NOTHING RETURNING *`,[randomUUID(),p.id,p.name,model.id,model.label,model.ownedBy||"",parsed.family,parsed.brand,parsed.modality,parsed.capabilityState,JSON.stringify(parsed)])).rows[0];
 if(row){await writePrices(tx,row.id,parsed);await tx.query("INSERT INTO app_supplier_model_metadata_versions(model_id,revision,actor,metadata) VALUES($1,1,'system-import',$2::jsonb)",[row.id,JSON.stringify(parsed)]);}
 else {
  const old=(await tx.query("SELECT * FROM app_supplier_model_metadata WHERE provider_id=$1 AND model_id=$2 FOR UPDATE",[p.id,model.id])).rows[0];
  if(parsed.capabilityState!=="unknown" && Number(old.revision)===1 && old.metadata.capabilityState==="unknown"){
   await tx.query("UPDATE app_supplier_model_metadata SET family=$2,brand=$3,modality=$4,capability_state=$5,metadata=$6::jsonb,revision=2,updated_by='system-import',updated_at=now() WHERE id=$1",[old.id,parsed.family,parsed.brand,parsed.modality,parsed.capabilityState,JSON.stringify(parsed)]);
   await writePrices(tx,old.id,parsed);await tx.query("INSERT INTO app_supplier_model_metadata_versions(model_id,revision,actor,metadata) VALUES($1,2,'system-import',$2::jsonb)",[old.id,JSON.stringify(parsed)]);
  }
  await tx.query("UPDATE app_supplier_model_metadata SET provider_name=$3,label=$4,catalog_owner=CASE WHEN $5='' THEN catalog_owner ELSE $5 END,last_seen_at=now() WHERE provider_id=$1 AND model_id=$2",[p.id,model.id,p.name,model.label,model.ownedBy||""]);
 }
 return !!row;
}
export async function ingestSupplierDirectory(pool:Pool,p:ModelProvider,models:ProviderCatalogModel[]){
 await ensureSupplierModels(pool);const tx=await pool.connect();let added=0;
 try{await tx.query("BEGIN");for(const m of models)if(await insert(tx,p,m,unknownSupplierMetadata()))added++;await tx.query("COMMIT");return added;}
 catch(e){await tx.query("ROLLBACK");throw e;}finally{tx.release();}
}
export async function importConfiguredSupplierModels(pool:Pool,config:ModelConfig){
 await ensureSupplierModels(pool);const tx=await pool.connect();let added=0;
 try{
  await tx.query("BEGIN");
  for(const u of config.upstreamModels){
   const p=config.providers.find(p=>p.id===u.providerId);if(!p)continue;
   const meta=unknownSupplierMetadata();meta.modality=u.modality;meta.family=u.modality==="image"?imageModelDisplayId(u.model):u.model;
   meta.capabilityState="configured";meta.capabilitySource="既有执行配置导入（不是自动逐项实测）";
   meta.parameterMetadata={parameterMap:structuredClone(u.parameterMap)};
   Object.assign(meta.capabilities,{generate:u.capabilities.generate,edit:u.capabilities.edit,vision:u.capabilities.vision,qualities:u.capabilities.qualities.length?u.capabilities.qualities:null,resolutions:u.capabilities.nativeResolutions.length?u.capabilities.nativeResolutions:null,maxReferences:u.capabilities.maxReferenceImages});
   const preset=config.defaultImagePreset?.enabled && config.defaultImagePreset.upstreamId===u.id ? config.defaultImagePreset:null;
   if(preset){meta.capabilities.mask=preset.supportsMask;meta.capabilities.ratios=preset.ratios;meta.capabilities.qualities=["low","medium"];meta.capabilities.resolutions=preset.resolutions;}
   const costs=preset?preset.prices.map(c=>({p:c.procurement,quality:c.quality,resolution:c.resolution})):u.procurement?[{p:u.procurement,quality:"",resolution:""}]:[];
   meta.prices=costs.filter(c=>["CNY","USD"].includes(c.p.currency)).map(c=>({id:randomUUID(),quality:c.quality,resolution:c.resolution,basis:c.p.basis==="tokens"?"token":c.p.basis==="image"?"image":"request",currency:c.p.currency,amountMicros:c.p.basis==="tokens"?null:c.p.amountMicros??null,inputMicrosPerMillion:c.p.basis==="tokens"?c.p.inputMicrosPerMillion??null:null,outputMicrosPerMillion:c.p.basis==="tokens"?c.p.outputMicrosPerMillion??null:null,cachedInputMicrosPerMillion:c.p.basis==="tokens"?c.p.cachedInputMicrosPerMillion??null:null,imageInputMicrosPerMillion:c.p.basis==="tokens"?c.p.imageInputMicrosPerMillion??null:null,source:c.p.source.slice(0,1000),sourceUrl:"",checkedAt:c.p.updatedAt.slice(0,10),status:c.p.confirmed===false || (c.p.basis==="tokens" ? c.p.inputMicrosPerMillion===undefined || c.p.outputMicrosPerMillion===undefined : c.p.amountMicros===undefined)?"unknown":"estimate"}));
   if(await insert(tx,p,{id:u.model,label:u.label || u.model},meta))added++;
  }
  await tx.query("COMMIT");return added;
 }catch(e){await tx.query("ROLLBACK");throw e;}finally{tx.release();}
}
export async function listSupplierModels(pool:Pool,filter:{query:string;provider:string;family:string;brand:string;basis:string;state:string;page:number}){
 await ensureSupplierModels(pool);
 const values=[filter.query,filter.provider,filter.family,filter.brand,filter.basis,filter.state];
 const where=`WHERE ($1='' OR m.model_id ILIKE '%'||$1||'%' OR m.label ILIKE '%'||$1||'%' OR m.family ILIKE '%'||$1||'%' OR m.brand ILIKE '%'||$1||'%') AND ($2='' OR m.provider_id=$2) AND ($3='' OR m.family=$3) AND ($4='' OR m.brand=$4) AND ($5='' OR EXISTS(SELECT 1 FROM app_supplier_model_price_points p WHERE p.model_id=m.id AND p.basis=$5)) AND ($6='' OR m.capability_state=$6)`;
 const [rows,count,facets]=await Promise.all([pool.query("SELECT m.* FROM app_supplier_model_metadata m "+where+" ORDER BY m.updated_at DESC,m.id LIMIT 50 OFFSET $7",[...values,(filter.page-1)*50]),pool.query("SELECT count(*) FROM app_supplier_model_metadata m "+where,values),pool.query("SELECT provider_id,provider_name,family,brand FROM app_supplier_model_metadata ORDER BY provider_name")]);
 return {models:rows.rows.map(record),total:Number(count.rows[0].count),page:filter.page,pageSize:50,facets:{providers:[...new Map(facets.rows.map(r=>[r.provider_id,{id:r.provider_id,name:r.provider_name}])).values()],families:[...new Set(facets.rows.map(r=>r.family).filter(Boolean))].sort(),brands:[...new Set(facets.rows.map(r=>r.brand).filter(Boolean))].sort()}};
}
export async function readSupplierModel(pool:Pool,id:string){
 await ensureSupplierModels(pool);const row=(await pool.query("SELECT * FROM app_supplier_model_metadata WHERE id=$1",[id])).rows[0];if(!row)throw new SupplierMetadataError("NOT_FOUND","模型元数据不存在",404);return record(row);
}
export async function saveSupplierModel(pool:Pool,input:{id:string;modelId:string;expectedRevision:number;metadata:SupplierMetadata;actor:string}){
 await ensureSupplierModels(pool);const metadata=supplierMetadataSchema.parse(input.metadata),hash=createHash("sha256").update(serial({...input,metadata})).digest("hex"),tx=await pool.connect();
 try{
  await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["supplier-metadata-operation:"+input.id]);
  const previous=(await tx.query("SELECT * FROM app_supplier_model_metadata_versions WHERE operation_id=$1",[input.id])).rows[0];
  if(previous){if(previous.request_fingerprint!==hash || previous.actor!==input.actor)throw new SupplierMetadataError("OPERATION_CONFLICT","此操作编号已用于不同修改",409);await tx.query("COMMIT");return {id:previous.model_id,revision:Number(previous.revision),replayed:true};}
  const row=(await tx.query("SELECT * FROM app_supplier_model_metadata WHERE id=$1 FOR UPDATE",[input.modelId])).rows[0];
  if(!row)throw new SupplierMetadataError("NOT_FOUND","模型元数据不存在",404);
  if(Number(row.revision)!==input.expectedRevision)throw new SupplierMetadataError("REVISION_CONFLICT","其他管理员已更新，请保留输入并刷新后核对",409);
  const revision=Number(row.revision)+1;
  await tx.query("UPDATE app_supplier_model_metadata SET family=$2,brand=$3,modality=$4,capability_state=$5,metadata=$6::jsonb,revision=$7,updated_by=$8,updated_at=now() WHERE id=$1",[input.modelId,metadata.family,metadata.brand,metadata.modality,metadata.capabilityState,JSON.stringify(metadata),revision,input.actor]);
  await writePrices(tx,input.modelId,metadata);
  await tx.query("INSERT INTO app_supplier_model_metadata_versions(model_id,revision,operation_id,request_fingerprint,actor,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[input.modelId,revision,input.id,hash,input.actor,JSON.stringify(metadata)]);
  await tx.query("COMMIT");return {id:input.modelId,revision,replayed:false};
 }catch(e){await tx.query("ROLLBACK");throw e;}finally{tx.release();}
}
export async function supplierModelHistory(pool:Pool,id:string){
 await readSupplierModel(pool,id);return (await pool.query("SELECT revision,actor,metadata,created_at FROM app_supplier_model_metadata_versions WHERE model_id=$1 ORDER BY revision DESC LIMIT 50",[id])).rows.map(r=>({revision:Number(r.revision),actor:r.actor,metadata:r.metadata,createdAt:new Date(r.created_at).toISOString()}));
}
