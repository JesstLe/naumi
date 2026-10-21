import "server-only";
import {z} from "zod";
import {biAuthorize,biJson,sameSiteBiMutation} from "../bi/access";
import {readBounded} from "../supplier-cost/io";
import {getModelAdministration} from "../model-config/server";
import {readProviderCatalog,refreshProviderCatalog} from "../model-config/catalog-store";
import {supplierMetadataSchema,PRICE_BASES,CAPABILITY_STATES} from "./types";
import {importConfiguredSupplierModels,ingestSupplierDirectory,listSupplierModels,readSupplierModel,saveSupplierModel,supplierModelHistory,SupplierMetadataError} from "./repository";
const input=z.discriminatedUnion("action",[
 z.strictObject({action:z.literal("sync"),discover:z.boolean().default(false)}),
 z.strictObject({action:z.literal("save"),id:z.uuid(),modelId:z.uuid(),expectedRevision:z.number().int().positive(),metadata:supplierMetadataSchema}),
]);
export function createSupplierModelsHandler(deps:{authorize:typeof biAuthorize;administration:typeof getModelAdministration}){
 return async(request:Request)=>{
  const auth=await deps.authorize(request);if(auth instanceof Response)return auth;
  if(request.method!=="GET" && !sameSiteBiMutation(request))return biJson({error:"不允许跨站修改"},403);
  try{
   const admin=await deps.administration(),snapshot=await admin.repo.current();
   if(request.method==="GET"){
    const p=new URL(request.url).searchParams;
    if(p.has("id"))return biJson({schemaVersion:1,model:await readSupplierModel(admin.pool,z.uuid().parse(p.get("id")))});
    if(p.has("history"))return biJson({schemaVersion:1,versions:await supplierModelHistory(admin.pool,z.uuid().parse(p.get("history")))});
    const filter={query:z.string().max(160).parse(p.get("q") || ""),provider:z.string().max(100).parse(p.get("provider") || ""),family:z.string().max(120).parse(p.get("family") || ""),brand:z.string().max(120).parse(p.get("brand") || ""),basis:z.union([z.literal(""),z.enum(PRICE_BASES)]).parse(p.get("basis") || ""),state:z.union([z.literal(""),z.enum(CAPABILITY_STATES)]).parse(p.get("state") || ""),page:z.coerce.number().int().min(1).max(200).parse(p.get("page") || 1)};
    const result=await listSupplierModels(admin.pool,filter,p.get("view")==="summary");
    return biJson({schemaVersion:1,...result,modelVersion:snapshot.version,providers:snapshot.config.providers.map(p=>({id:p.id,name:p.name,enabled:p.enabled}))});
   }
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
   if(e instanceof SupplierMetadataError)return biJson({error:e.message,code:e.code},e.status);
   if(e instanceof z.ZodError || e instanceof SyntaxError)return biJson({error:e instanceof z.ZodError?e.issues[0]?.message || "元数据参数无效":"参数无效"},400);
   return biJson({error:"元数据库操作暂不可用，请稍后核对重试"},503);
  }
 };
}
export const supplierModelsHandler=createSupplierModelsHandler({authorize:biAuthorize,administration:getModelAdministration});
