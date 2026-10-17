import { z } from 'zod';
import { workflowBridgeConfig,workflowIdentityToken,workflowSourceIdentity } from '@/lib/enterprise/workflow-identity';
import { teamJson,teamFailure } from '@/lib/teams/access';
import { IntegrationError } from '@/lib/enterprise/integration/policy';
import { rateLimit } from '@/lib/rate-limit';
export const runtime='nodejs';export const dynamic='force-dynamic';
const query=z.strictObject({action:z.literal('context'),enterpriseId:z.string().uuid()});
export async function GET(request:Request){
 const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return teamJson({error:'工作区参数无效'},400);
 try{
  const identity=await workflowSourceIdentity(request,parsed.data.enterpriseId);
  if(!rateLimit('workflow-identity:'+JSON.stringify(identity),60,60_000))return teamJson({error:'请求过于频繁'},429);
  const config=workflowBridgeConfig();let response:Response;
  try{response=await fetch(config.origin+'/v1/identity/workspaces',{headers:{authorization:'Bearer '+workflowIdentityToken(identity,config),Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});}catch{return teamJson({error:'WORKFLOW_SERVICE_UNAVAILABLE'},503);}
  if(!response.ok)return teamJson({error:response.status===403?'WORKFLOW_IDENTITY_NOT_BOUND_OR_REVOKED':'WORKFLOW_SERVICE_UNAVAILABLE'},response.status===403?403:503);
  const schema=z.strictObject({enterpriseId:z.string().uuid(),subject:z.string().max(254),teams:z.array(z.strictObject({teamId:z.string().uuid(),permissions:z.array(z.enum(['request','dispatch','execute','review','manage'])),workKinds:z.array(z.enum(['design','artwork']))})).max(100)});
  const data=schema.safeParse(await response.json());if(!data.success)return teamJson({error:'WORKFLOW_RESPONSE_INVALID'},502);
  return teamJson({version:1,source:identity,workspace:data.data});
 }catch(e){if(e instanceof IntegrationError)return teamJson({error:e.code},e.status);return teamFailure(e);}
}
