import "server-only";
import { z } from "zod";
import { biAuthorize, biJson, sameSiteBiMutation } from "../bi/access";
import { getModelAdministration } from "./server";
import { readProviderCatalog, refreshProviderCatalog } from "./catalog-store";
import type { ModelProvider } from "./types";
import { readBounded } from "../supplier-cost/io";

const input=z.strictObject({providerId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/),draftId:z.uuid(),expectedRevision:z.number().int().positive()});
export function createCatalogHandler(deps:{authorize:typeof biAuthorize;administration:typeof getModelAdministration;fetcher?:typeof fetch}){
  return async(request:Request)=>{
    const auth=await deps.authorize(request);if(auth instanceof Response)return auth;
    if(request.method==='POST'&&!sameSiteBiMutation(request))return biJson({error:'不允许跨站查询'},403);
    try{
      const admin=await deps.administration(),draft=await admin.repo.draft(auth.actor);
      const configured=(p:ModelProvider)=>draft.config.upstreamModels.filter(m=>m.providerId===p.id).map(m=>({id:m.model,label:m.label}));
      if(request.method==='GET')return biJson({providers:(await readProviderCatalog(admin.pool,draft.config.providers)).map(p=>({...p,configuredModels:configured(draft.config.providers.find(v=>v.id===p.providerId)!)}))});
      const body=input.parse(JSON.parse(await readBounded(new Response(request.body),8192)));
      if(body.draftId!==draft.id||body.expectedRevision!==draft.revision)return biJson({error:'草稿已更新，请保存并刷新目录'},409);
      const p=draft.config.providers.find(p=>p.id===body.providerId);if(!p)return biJson({error:'供应商不存在'},404);
      return biJson({...await refreshProviderCatalog(admin.pool,p,admin.credentials,admin.trustedOrigins,deps.fetcher),configuredModels:configured(p)});
    }catch(e){const invalid=e instanceof z.ZodError||e instanceof SyntaxError;return biJson({error:invalid?'查询参数无效':'供应商模型目录暂时不可用'},invalid?400:503)}
  }
}
export const providerCatalogHandler=createCatalogHandler({authorize:biAuthorize,administration:getModelAdministration});
