import "server-only";
import {createHash,randomUUID} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {ensureSupplierModels} from "./schema";
import {supplierMetadataSchema,unknownSupplierMetadata,type SupplierMetadata,type SupplierModelRecord} from "./types";
import type {ModelConfig,ModelProvider} from "../model-config/types";
import type {ProviderCatalogModel} from "../model-config/catalog";
import {specificationResolution} from "./specifications";
import {imageModelDisplayId} from "../image-model-routing";
import { cleanSource, documentedMetadata, reverseHubCatalogMetadata, sourceHash, type PublicSupplierDirectory } from "./discovery";
import {documentedVideoDefinition} from "./discovery";
import {ensureSupplierVideoSchema,recordSupplierVideoDefinition} from "./video-access";

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
export async function ingestSupplierSources(pool: Pool, provider: ModelProvider, directory: {models: ProviderCatalogModel[]; fetchedAt: string; truncated?: boolean; status: string}, published: PublicSupplierDirectory | null) {
 await ensureSupplierModels(pool);
 await ensureSupplierVideoSchema(pool);
 const tx = await pool.connect();
 try {
  await tx.query("BEGIN");
  const accessible = new Map(directory.models.map(m => [m.id, m]));
  const publishedRows = (published?.body.data || []).filter((m: any) => typeof m.model_name === "string" && !!m.model_name.trim() && m.model_name.length <= 160 && !/[\u0000-\u001f\u007f]/.test(m.model_name));
  const publicMap = new Map<string, any>(publishedRows.map((m: any) => [m.model_name, m]));
  const specifications=published?.specifications;
  const specificationMap=new Map<string,any>((specifications?.body.models||[]).filter((m:any)=>typeof m.id==="string"&&m.id.length<=160&&Array.isArray(m.parameters)&&JSON.stringify(m).length<=35000).map((m:any)=>[m.id,m]));
  const directoryUrl = provider.baseUrl.replace(/\/$/, "") + "/models";
  const snapshot = async (kind: string, url: string, data: unknown) => {
   const safe = cleanSource(data);
   await tx.query("INSERT INTO app_supplier_source_snapshots(provider_id,kind,source_url,content_hash,source_data) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(provider_id,kind,content_hash) DO UPDATE SET last_seen_at=now()", [provider.id,kind,url,sourceHash(safe),JSON.stringify(safe)]);
  };
  if (["ok", "empty"].includes(directory.status)) await snapshot("authenticated-directory", directoryUrl, {provider: {id: provider.id,name:provider.name,baseUrl:provider.baseUrl,protocol:provider.protocol},models: directory.models, truncated:!!directory.truncated});
  if (published?.body.success===true) await snapshot("public-pricing", published.url, published.body);
  if(published?.specifications)await snapshot("public-parameters",published.specifications.url,published.specifications.body);
  const oldModels = (await tx.query("SELECT model_id FROM app_supplier_model_metadata WHERE provider_id=$1", [provider.id])).rows.map(r => r.model_id as string);
  let added = 0;
  for (const id of new Set([...accessible.keys(), ...publicMap.keys(), ...specificationMap.keys(), ...oldModels])) {
   const raw = publicMap.get(id), listed = accessible.get(id),specification=specificationMap.get(id);
   if (!raw && !listed && !specification && !["ok", "empty"].includes(directory.status)) continue;
   const videoDefinition=documentedVideoDefinition(cleanSource(specification))||documentedVideoDefinition(cleanSource(raw))||documentedVideoDefinition(cleanSource(listed?.sourceMetadata));
   if(videoDefinition)await recordSupplierVideoDefinition(pool,{providerId:provider.id,modelId:id,definition:videoDefinition,sourceUrl:specification&&specifications?specifications.url:raw&&published?published.url:directoryUrl},tx);
   const initial = raw && published ? documentedMetadata(raw, published) : (provider.options?.imageAdapter === "reverse-hub" ? reverseHubCatalogMetadata(listed?.sourceMetadata, directoryUrl, directory.fetchedAt) : undefined) || unknownSupplierMetadata();
   if(specification&&specifications){
    if(initial.modality==="unknown"&&["image","video","text","audio"].includes(specification.modality))initial.modality=specification.modality;
    const resolution=specificationResolution(specification);if(resolution&&!initial.capabilities.resolutions)initial.capabilities.resolutions=resolution.nativeValues;
    if(initial.capabilityState==="unknown"){initial.capabilityState="documented";initial.capabilitySource="供应商正式参数文档（未逐项实测）";initial.capabilityUrl=specifications.url;initial.checkedAt=specifications.fetchedAt.slice(0,10);}
   }
   if (await insert(tx, provider, listed || {id,label:specification?.label||id}, initial)) added++;
   const row = (await tx.query("SELECT * FROM app_supplier_model_metadata WHERE provider_id=$1 AND model_id=$2 FOR UPDATE", [provider.id,id])).rows[0];
   const metadata = supplierMetadataSchema.parse(row.metadata);
   const prior = metadata.parameterMetadata.upstreamImport as any;
   const {observedAt: _previousObservation, ...previousSource} = prior || {};
   const source = {
    ...previousSource,
    accessibleWithCurrentKey: listed ? true : ["ok", "empty"].includes(directory.status) && !directory.truncated ? false : null,
    directoryUrl,
    ...(listed?.sourceMetadata ? {authenticatedModel:listed.sourceMetadata} : {}),
    ...(raw && published ? {publicUrl:published.url,publicHash:sourceHash(raw),publicModel:raw} : {}),
    ...(specification&&specifications?{parameterUrl:specifications.url,parameterHash:sourceHash(specification),capabilityVersion:specifications.body.capability_version||""}:{}),
   };
   // Same source refresh updates lastSeen, without spamming revisions or replacing manual edits.
   if (serial(previousSource) === serial(source)) continue;
   if(specification&&specifications)metadata.parameterMetadata.supplierSpecification={url:specifications.url,modelUrl:new URL("/docs/model/"+encodeURIComponent(id),specifications.url).toString(),version:specifications.body.version||"",capabilityVersion:specifications.body.capability_version||"",observedAt:specifications.fetchedAt,model:specification};
   metadata.parameterMetadata.upstreamImport = {...source,observedAt: directory.fetchedAt || published?.fetchedAt || new Date().toISOString()};
   const parsed = supplierMetadataSchema.parse(metadata), revision = Number(row.revision)+1;
   await tx.query("UPDATE app_supplier_model_metadata SET metadata=$2::jsonb,revision=$3,updated_by='system-discovery',updated_at=now() WHERE id=$1",[row.id,JSON.stringify(parsed),revision]);
   await tx.query("INSERT INTO app_supplier_model_metadata_versions(model_id,revision,actor,metadata) VALUES($1,$2,'system-discovery',$3::jsonb)",[row.id,revision,JSON.stringify(parsed)]);
  }
  await tx.query("COMMIT"); return added;
 } catch(e) { await tx.query("ROLLBACK"); throw e; } finally {tx.release();}
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
export async function listSupplierModels(pool:Pool,filter:{query:string;provider:string;family:string;brand:string;basis:string;state:string;page:number},summary=false){
 await ensureSupplierModels(pool);
 const values=[filter.query,filter.provider,filter.family,filter.brand,filter.basis,filter.state];
 const where=`WHERE ($1='' OR m.model_id ILIKE '%'||$1||'%' OR m.label ILIKE '%'||$1||'%' OR m.family ILIKE '%'||$1||'%' OR m.brand ILIKE '%'||$1||'%') AND ($2='' OR m.provider_id=$2) AND ($3='' OR m.family=$3) AND ($4='' OR m.brand=$4) AND ($5='' OR EXISTS(SELECT 1 FROM app_supplier_model_price_points p WHERE p.model_id=m.id AND p.basis=$5)) AND ($6='' OR m.capability_state=$6)`;
 const columns=summary ? `m.id,m.provider_id,m.provider_name,m.model_id,m.label,m.catalog_owner,m.revision,m.last_seen_at,m.updated_at,
   jsonb_build_object('family',m.metadata->'family','brand',m.metadata->'brand','modality',m.metadata->'modality',
   'capabilityState',m.metadata->'capabilityState','capabilitySource',m.metadata->'capabilitySource','checkedAt',m.metadata->'checkedAt',
   'capabilities',jsonb_build_object('resolutions',m.metadata#>'{capabilities,resolutions}'),'prices',m.metadata->'prices') AS metadata` : "m.*";
 const [rows,count,facets]=await Promise.all([pool.query("SELECT "+columns+" FROM app_supplier_model_metadata m "+where+" ORDER BY m.updated_at DESC,m.id LIMIT 50 OFFSET $7",[...values,(filter.page-1)*50]),pool.query("SELECT count(*) FROM app_supplier_model_metadata m "+where,values),pool.query("SELECT provider_id,provider_name,family,brand FROM app_supplier_model_metadata ORDER BY provider_name")]);
 const models=rows.rows.map(r=>summary?{...r.metadata,id:r.id,providerId:r.provider_id,providerName:r.provider_name,modelId:r.model_id,label:r.label,catalogOwner:r.catalog_owner,revision:Number(r.revision),lastSeenAt:new Date(r.last_seen_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()}:record(r));
 return {models,total:Number(count.rows[0].count),page:filter.page,pageSize:50,facets:{providers:[...new Map(facets.rows.map(r=>[r.provider_id,{id:r.provider_id,name:r.provider_name}])).values()],families:[...new Set(facets.rows.map(r=>r.family).filter(Boolean))].sort(),brands:[...new Set(facets.rows.map(r=>r.brand).filter(Boolean))].sort()}};
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
