import { z } from 'zod';
import { workflowBridgeConfig,workflowIdentityToken,workflowSourceIdentity } from '@/lib/enterprise/workflow-identity';
import { teamJson,teamFailure } from '@/lib/teams/access';
import { IntegrationError } from '@/lib/enterprise/integration/policy';
import { rateLimit } from '@/lib/rate-limit';
export const runtime='nodejs';export const dynamic='force-dynamic';
const scope={enterpriseId:z.string().uuid(),teamId:z.string().uuid()};
const query=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('context'),enterpriseId:z.string().uuid()}),
 z.strictObject({action:z.literal('people'),...scope,sourceHash:z.string().regex(/^[a-f0-9]{64}$/)}),
 z.strictObject({action:z.literal('people-audit'),...scope}),
]);
export async function GET(request:Request){
 const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return teamJson({error:'工作区参数无效'},400);
 try{
  const identity=await workflowSourceIdentity(request,parsed.data.enterpriseId);
  if(!rateLimit('workflow-identity:'+JSON.stringify(identity),60,60_000))return teamJson({error:'请求过于频繁'},429);
  const config=workflowBridgeConfig();let response:Response;const q=parsed.data,path=q.action==='context'?'/v1/identity/workspaces':q.action==='people'?'/v1/people?source='+q.sourceHash:'/v1/people/audit';
  try{response=await fetch(config.origin+path,{headers:{authorization:'Bearer '+workflowIdentityToken(identity,config,'teamId' in q?q.teamId:undefined),Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});}catch{return teamJson({error:'WORKFLOW_SERVICE_UNAVAILABLE'},503);}
  if(!response.ok)return teamJson({error:response.status===403?'WORKFLOW_IDENTITY_NOT_BOUND_OR_REVOKED':'WORKFLOW_SERVICE_UNAVAILABLE'},response.status===403?403:503);
  if(q.action!=='context')return teamJson(await response.json());
  const schema=z.strictObject({enterpriseId:z.string().uuid(),subject:z.string().max(254),teams:z.array(z.strictObject({teamId:z.string().uuid(),permissions:z.array(z.enum(['request','dispatch','execute','review','manage'])),workKinds:z.array(z.enum(['design','artwork']))})).max(100)});
  const data=schema.safeParse(await response.json());if(!data.success)return teamJson({error:'WORKFLOW_RESPONSE_INVALID'},502);
  return teamJson({version:1,source:identity,workspace:data.data});
 }catch(e){if(e instanceof IntegrationError)return teamJson({error:e.code},e.status);return teamFailure(e);}
}
export async function POST(request:Request){
 const q=z.strictObject({action:z.enum(['people-profile','people-preview','people-apply']),...scope}).safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!q.success)return teamJson({error:'工作区参数无效'},400);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return teamJson({error:'ORIGIN_REQUIRED'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return teamJson({error:'JSON_REQUIRED'},415);
 try{
  const identity=await workflowSourceIdentity(request,q.data.enterpriseId);if(!rateLimit('workflow-write:'+JSON.stringify(identity),60,60_000))return teamJson({error:'请求过于频繁'},429);
  const chunks:Uint8Array[]=[];let size=0;const reader=request.body?.getReader();if(reader)for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>128*1024){await reader.cancel();return teamJson({error:'BODY_TOO_LARGE'},413);}chunks.push(next.value);}const text=Buffer.concat(chunks).toString('utf8');try{JSON.parse(text);}catch{return teamJson({error:'INVALID_JSON'},400);}
  const config=workflowBridgeConfig(),path={ 'people-profile':'profile','people-preview':'preview','people-apply':'apply' }[q.data.action];let response:Response;
  try{response=await fetch(config.origin+'/v1/people/'+path,{method:'POST',headers:{authorization:'Bearer '+workflowIdentityToken(identity,config,q.data.teamId),'content-type':'application/json'},body:text,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{return teamJson({error:'WORKFLOW_WRITE_UNCERTAIN',uncertain:true},503);}
  if(!response.headers.get('content-type')?.includes('application/json'))return teamJson({error:'WORKFLOW_RESPONSE_INVALID'},502);
  return teamJson(await response.json(),response.status);
 }catch(e){if(e instanceof IntegrationError)return teamJson({error:e.code},e.status);return teamFailure(e);}
}
