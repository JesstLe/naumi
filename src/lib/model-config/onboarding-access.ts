import 'server-only';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {biAuthorize,biJson,sameSiteBiMutation} from '../bi/access';
import {getModelAdministration} from './server';
import {onboardingFields} from './onboarding-schema';
import {onboardingDraftEntries,planModelOnboarding} from './onboarding';
import {validateModelConfig} from './schema';
import {ModelConfigError} from './types';
import {readBounded} from '../supplier-cost/io';
import type {ManagementAdministration} from './management-input';
const input=z.strictObject({action:z.enum(['preview','save']),expectedVersion:z.number().int().positive(),expectedRevision:z.number().int().positive().optional(),...onboardingFields});
export function createOnboardingHandler(deps:{authorize:typeof biAuthorize;administration:()=>Promise<ManagementAdministration>}){
 return async(request:Request)=>{
  const auth=await deps.authorize(request);if(auth instanceof Response)return auth;
  if(request.method!=='GET'&&!sameSiteBiMutation(request))return biJson({error:'不允许跨站修改'},403);
  try{
   const admin=await deps.administration(),snapshot=await admin.repo.current(),billing=await admin.billing.current();
   const prefix=auth.actor.slice(0,140)+'#model-onboarding:'+createHash('sha256').update(auth.actor).digest('hex').slice(0,16)+':';
   const actor=prefix+snapshot.version;
   if(request.method==='GET'){
    const draft=await admin.repo.draft(actor);
    const base=await admin.repo.byVersion(draft.basedOnVersion);
    let entries=onboardingDraftEntries(draft.config,base.config),recoveredFromVersion:number|undefined;
    if(!entries.length){
     const previous=await admin.pool.query('SELECT actor FROM app_model_drafts WHERE left(actor,length($1))=$1 AND actor<>$2 ORDER BY updated_at DESC LIMIT 5',[prefix,actor]);
     for(const row of previous.rows){const prior=await admin.repo.draft(row.actor),base=await admin.repo.byVersion(prior.basedOnVersion);
      const remaining=onboardingDraftEntries(prior.config,base.config).filter(e=>!snapshot.config.publicModels.some(m=>m.id===e.publicId));
      if(remaining.length){entries=remaining;recoveredFromVersion=prior.basedOnVersion;break;}
     }
    }
    return biJson({draft:{id:draft.id,revision:draft.revision,basedOnVersion:draft.basedOnVersion,billingVersion:billing.version,entries,...(recoveredFromVersion?{recoveredFromVersion}:{})}});
   }
   const body=input.parse(JSON.parse(await readBounded(new Response(request.body),96000)));
   if(body.expectedVersion!==snapshot.version||body.expectedBillingVersion!==billing.version)throw new ModelConfigError('CONFIG_CONFLICT','模型或计费版本已变化，请刷新核对后继续',409);
   const plan=planModelOnboarding(snapshot,billing,{...body,...(body.action==='save'?{enabled:false}:{})});
   validateModelConfig(plan.config,{trustedOrigins:admin.trustedOrigins});
   if(body.action==='preview')return biJson({version:snapshot.version,billingVersion:billing.version,changes:plan.changes});
   const draft=await admin.repo.draft(actor);
   if(body.expectedRevision!==draft.revision)throw new ModelConfigError('DRAFT_CONFLICT','创建草稿已改变，请重新打开草稿后继续',409);
   const saved=await admin.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:plan.config,actor});
   return biJson({draft:{id:saved.id,revision:saved.revision,basedOnVersion:saved.basedOnVersion,billingVersion:billing.version,entries:onboardingDraftEntries(saved.config,snapshot.config)}});
  }catch(error){
   if(error instanceof ModelConfigError)return biJson({error:error.message,code:error.code},error.status);
   if(error instanceof z.ZodError||error instanceof SyntaxError)return biJson({error:'请检查模型身份、用途、参数与售价',code:'INVALID_REQUEST'},400);
   return biJson({error:'创建配置暂不可用，请重新核对草稿',code:'CONFIG_UNAVAILABLE'},503);
  }
 };
}
export const modelOnboardingHandler=createOnboardingHandler({authorize:biAuthorize,administration:getModelAdministration});
