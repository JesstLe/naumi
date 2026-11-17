import 'server-only';
import {z} from 'zod';
import {biAuthorize,biJson,sameSiteBiMutation} from '../bi/access';
import {getModelAdministration} from './server';
import {onboardingFields} from './onboarding-schema';
import {onboardingDraftEntries,planModelOnboarding} from './onboarding';
import {validateModelConfig} from './schema';
import {ModelConfigError} from './types';
import {readBounded} from '../supplier-cost/io';
import type {ManagementAdministration} from './management-input';
import {emptyOnboardingDraftId,onboardingDraftOwner,publishedOnboardingRead,readOnboardingDraft,type OnboardingReadPorts} from './onboarding-read';
const input=z.strictObject({action:z.enum(['preview','save']),expectedVersion:z.number().int().positive(),expectedRevision:z.number().int().positive().optional(),...onboardingFields});
export function createOnboardingHandler(deps:{authorize:typeof biAuthorize;administration:()=>Promise<ManagementAdministration>;readPorts?:()=>OnboardingReadPorts}){
 return async(request:Request)=>{
  const auth=await deps.authorize(request);if(auth instanceof Response)return auth;
  if(request.method!=='GET'&&!sameSiteBiMutation(request))return biJson({error:'不允许跨站修改'},403);
  try{
   if(request.method==='GET'){
    request.signal.throwIfAborted();
    const ports=deps.readPorts?.()??await (async()=>{
     const admin=await deps.administration(),model=await admin.repo.current(),billing=await admin.billing.current();
     return {pool:admin.pool,trustedOrigins:admin.trustedOrigins,model:async()=>model,billingVersion:async()=>billing.version};
    })();
    return biJson({draft:await readOnboardingDraft(ports,auth.actor,request.signal)});
   }
   const body=input.parse(JSON.parse(await readBounded(new Response(request.body),96000)));
   const admin=await deps.administration(),snapshot=await admin.repo.current(),billing=await admin.billing.current();
   const {actor}=onboardingDraftOwner(auth.actor,snapshot.version);
   if(body.expectedVersion!==snapshot.version||body.expectedBillingVersion!==billing.version)throw new ModelConfigError('CONFIG_CONFLICT','模型或计费版本已变化，请刷新核对后继续',409);
   const plan=planModelOnboarding(snapshot,billing,{...body,...(body.action==='save'?{enabled:false}:{})});
   validateModelConfig(plan.config,{trustedOrigins:admin.trustedOrigins});
   if(body.action==='preview')return biJson({version:snapshot.version,billingVersion:billing.version,changes:plan.changes});
   if(body.expectedRevision===undefined)throw new ModelConfigError('DRAFT_CONFLICT','创建草稿已改变，请重新打开草稿后继续',409);
   const saved=await admin.repo.saveOnboardingDraft({initialId:emptyOnboardingDraftId(actor),expectedVersion:snapshot.version,expectedRevision:body.expectedRevision,config:plan.config,actor});
   return biJson({draft:{id:saved.id,revision:saved.revision,basedOnVersion:saved.basedOnVersion,billingVersion:billing.version,entries:onboardingDraftEntries(saved.config,snapshot.config)}});
  }catch(error){
   if(request.method==='GET'&&request.signal.aborted)return biJson({error:'查询已取消'},499);
   if(error instanceof ModelConfigError)return biJson({error:error.message,code:error.code},error.status);
   if(error instanceof z.ZodError||error instanceof SyntaxError)return biJson({error:'请检查模型身份、用途、参数与售价',code:'INVALID_REQUEST'},400);
   return biJson({error:'创建配置暂不可用，请重新核对草稿',code:'CONFIG_UNAVAILABLE'},503);
  }
 };
}
export const modelOnboardingHandler=createOnboardingHandler({authorize:biAuthorize,administration:getModelAdministration,readPorts:publishedOnboardingRead});
