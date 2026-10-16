import "server-only";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { biAuthorize, biJson, sameSiteBiMutation } from "../bi/access";
import { readBounded } from "../supplier-cost/io";
import { getModelAdministration } from "../model-config/server";
import { createHealthRepository } from "./repository";
import { scanModelHealthOnce } from "./service";
import {configuredHealthTargets} from "./targets";

const mutation = z.discriminatedUnion("action",[
  z.strictObject({action:z.literal("tick")}),
  z.strictObject({action:z.literal("reconcile"),key:z.string().regex(/^[a-f0-9]{64}$/),observedAt:z.iso.datetime(),confirmed:z.literal(true)}),
  z.strictObject({action:z.literal("policy"),revision:z.number().int().positive(),policy:z.strictObject({enabled:z.boolean(),staleHours:z.number().int().min(6).max(168),dailyMaxCalls:z.number().int().min(0).max(12),timeZone:z.literal("Asia/Shanghai").optional()})}),
]);
export function createHealthHandler(deps:{authorize:(request:Request)=>Promise<{actor:string}|Response>;administration:typeof getModelAdministration;tick:typeof scanModelHealthOnce}) {
  return async(request:Request)=>{
    const auth=await deps.authorize(request);if(auth instanceof Response)return auth;
    if(request.method!=="GET"&&!sameSiteBiMutation(request))return biJson({error:"不允许跨站修改"},403);
    try {
      const admin=await deps.administration(),repo=createHealthRepository(admin.pool);
      if(request.method==="GET")return biJson(await repo.overview(await admin.repo.current()));
      if(request.method!=="POST")return biJson({error:"请求方法无效"},405);
      const body=mutation.parse(JSON.parse(await readBounded(new Response(request.body),4096)));
      if(body.action==="policy"){
        const saved=await repo.savePolicy({...body.policy,timeZone:"Asia/Shanghai"},body.revision,auth.actor);
        if(!saved)return biJson({error:"设置已更新，请刷新后重试"},409);
      } else if(body.action==="reconcile"){
        if(!configuredHealthTargets((await admin.repo.current()).config).some(t=>t.key===body.key))return biJson({error:"模型配置已变化，请刷新"},409);
        if(!await repo.reconcile(body.key,body.observedAt,auth.actor))return biJson({error:"状态已变化或仍在巡检，请刷新后核查"},409);
      } else await deps.tick("manual");
      return biJson(await repo.overview(await admin.repo.current()));
    } catch(error) {
      if(error instanceof z.ZodError||error instanceof SyntaxError)return biJson({error:"巡检参数无效：间隔至少6小时，每日0至12次"},400);
      return biJson({error:"健康巡检暂未完成，请刷新状态"},503);
    }
  };
}
export const modelHealthHandler=createHealthHandler({authorize:biAuthorize,administration:getModelAdministration,tick:scanModelHealthOnce});
export function healthWorkerAuthorized(request:Request) {
  const configured=process.env.MODEL_HEALTH_WORKER_SECRET||"",supplied=request.headers.get("x-model-health-worker-secret")||"";
  const a=Buffer.from(configured),b=Buffer.from(supplied);
  return configured.trim().length>=32&&a.length===b.length&&timingSafeEqual(a,b);
}
