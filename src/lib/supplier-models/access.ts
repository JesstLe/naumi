import "server-only";
import {z} from "zod";
import type {Pool,PoolClient} from 'pg';
import {getPool} from '@/platform/db/pool';
import {checkReadClientSocket,withOwnedReportClient} from '@/platform/db/owned-read-client';
import {biAuthorize,biJson,sameSiteBiMutation} from "../bi/access";
import {readBounded} from "../supplier-cost/io";
import {getModelAdministration} from "../model-config/server";
import {modelTrustedOrigins} from '../model-config/environment';
import {readPublishedModelSnapshot} from '../model-config/published-repository';
import {readProviderCatalog,refreshProviderCatalog} from "../model-config/catalog-store";
import {supplierMetadataSchema,PRICE_BASES,CAPABILITY_STATES} from "./types";
import {importConfiguredSupplierModels,ingestSupplierDirectory,listSupplierModelsFrom,readSupplierModelFrom,saveSupplierModel,supplierModelHistoryFrom,SupplierMetadataError} from "./repository";
import {ensureSupplierModels} from './schema';
const input=z.discriminatedUnion("action",[
 z.strictObject({action:z.literal("sync"),discover:z.boolean().default(false)}),
 z.strictObject({action:z.literal("save"),id:z.uuid(),modelId:z.uuid(),expectedRevision:z.number().int().positive(),metadata:supplierMetadataSchema}),
]);
type LibraryReadPorts={pool:Pool;model:(tx:PoolClient)=>ReturnType<typeof readPublishedModelSnapshot>};
export function createSupplierModelsHandler(deps:{authorize:typeof biAuthorize;administration:typeof getModelAdministration;readPorts?:()=>LibraryReadPorts}){
 return async(request:Request)=>{
  const auth=await deps.authorize(request);if(auth instanceof Response)return auth;
  if(request.method!=="GET" && !sameSiteBiMutation(request))return biJson({error:"不允许跨站修改"},403);
  try{
   if(request.method==="GET"){
    const p=new URL(request.url).searchParams;
    const id=p.has('id')?z.uuid().parse(p.get('id')):null,history=!id&&p.has('history')?z.uuid().parse(p.get('history')):null;
    const filter=id||history?null:{query:z.string().max(160).parse(p.get("q") || ""),provider:z.string().max(100).parse(p.get("provider") || ""),family:z.string().max(120).parse(p.get("family") || ""),brand:z.string().max(120).parse(p.get("brand") || ""),basis:z.union([z.literal(""),z.enum(PRICE_BASES)]).parse(p.get("basis") || ""),state:z.union([z.literal(""),z.enum(CAPABILITY_STATES)]).parse(p.get("state") || ""),page:z.coerce.number().int().min(1).max(200).parse(p.get("page") || 1)};
    const ports=deps.readPorts?.()??await (async()=>{
     const admin=await deps.administration(),snapshot=await admin.repo.current();
     await ensureSupplierModels(admin.pool);return {pool:admin.pool,model:async()=>snapshot};
    })();
    const result=await withOwnedReportClient(ports.pool,async tx=>{
     await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
     await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='3s'"+checkReadClientSocket);
     const snapshot=await ports.model(tx);
     if(!snapshot)throw new SupplierMetadataError('CONFIG_UNAVAILABLE','元数据库操作暂不可用，请稍后核对重试',503);
     const payload=id?{model:await readSupplierModelFrom(tx,id)}:history?{versions:await supplierModelHistoryFrom(tx,history)}:{
      ...await listSupplierModelsFrom(tx,filter!,p.get('view')==='summary'),modelVersion:snapshot.version,
      providers:snapshot.config.providers.map(p=>({id:p.id,name:p.name,enabled:p.enabled})),
     };
     await tx.query('COMMIT');return payload;
    },request.signal);
    return biJson({schemaVersion:1,...result});
   }
   const admin=await deps.administration(),snapshot=await admin.repo.current();
   const body=input.parse(JSON.parse(await readBounded(new Response(request.body),750000)));
   if(body.action==="save")return biJson(await saveSupplierModel(admin.pool,{...body,actor:auth.actor}));
   const configured=await importConfiguredSupplierModels(admin.pool,snapshot.config),statuses:{id:string;status:string;count:number}[]=[];
   const catalogs=await readProviderCatalog(admin.pool,snapshot.config.providers);
   let directory=0;
   for(const p of snapshot.config.providers){
    const catalog=body.discover && p.enabled ? await refreshProviderCatalog(admin.pool,p,admin.credentials,admin.trustedOrigins,undefined,true):catalogs.find(c=>c.providerId===p.id);
    if(catalog?.models.length)directory+=await ingestSupplierDirectory(admin.pool,p,catalog.models);
    statuses.push({id:p.id,status:catalog?.status || "empty",count:catalog?.models.length || 0});
   }
   return biJson({configuredImported:configured,directoryImported:directory,statuses,modelVersion:snapshot.version});
  }catch(e){
   if(request.method==='GET'&&request.signal.aborted)return biJson({error:'请求已取消'},499);
   if(e instanceof SupplierMetadataError)return biJson({error:e.message,code:e.code},e.status);
   if(e instanceof z.ZodError || e instanceof SyntaxError)return biJson({error:e instanceof z.ZodError?e.issues[0]?.message || "元数据参数无效":"参数无效"},400);
   return biJson({error:"元数据库操作暂不可用，请稍后核对重试"},503);
  }
 };
}
export const supplierModelsHandler=createSupplierModelsHandler({authorize:biAuthorize,administration:getModelAdministration,
 readPorts:()=>({pool:getPool(),model:tx=>readPublishedModelSnapshot(tx,{trustedOrigins:modelTrustedOrigins()})})});
