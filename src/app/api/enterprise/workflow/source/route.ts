import {workflowSameOrigin} from '@/lib/enterprise/workflow-origin';
import {sign} from 'node:crypto';
import {z} from 'zod';
import {teamJson,teamFailure} from '@/lib/teams/access';
import {TeamError} from '@/lib/teams/server';
import {rateLimit} from '@/lib/rate-limit';
import {workflowBridgeConfig,workflowSourceIdentity,workflowIdentityToken} from '@/lib/enterprise/workflow-identity';
import {deploymentPolicy,IntegrationError} from '@/lib/enterprise/integration/policy';
import type {IntegratedRecord} from '@/lib/enterprise/integration/contracts';
import {CreationAdapter,linkedLedgerSummary} from '@/lib/enterprise/integration/creation-adapter';
import {enterpriseMediaResponse} from '@/lib/enterprise/media-response';
import {commandSchema,sourceRefSchema,type WorkOrder,type Command} from '../../../../../../services/enterprise-workflow/src/contracts';
import {sourceCommandDigest} from '../../../../../../services/enterprise-workflow/src/source-evidence';
export const runtime='nodejs';export const dynamic='force-dynamic';
const scope={enterpriseId:z.string().uuid(),teamId:z.string().uuid(),orderId:z.string().uuid(),taskId:z.string().uuid()};
const query=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('links'),...scope}),
 z.strictObject({action:z.literal('candidates'),...scope,kind:z.enum(['artworks','generations','ledger']),from:z.string().optional(),to:z.string().optional(),email:z.string().max(254).optional(),page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('record'),...scope,kind:sourceRefSchema.shape.kind,id:sourceRefSchema.shape.id}),
 z.strictObject({action:z.literal('media'),...scope,kind:z.literal('artwork'),id:sourceRefSchema.shape.id}),
]);
async function prepare(request:Request,q:z.infer<typeof query>){
 const identity=await workflowSourceIdentity(request,q.enterpriseId);if(!rateLimit('workflow-source:'+JSON.stringify(identity),60,60000))throw new IntegrationError('SOURCE_RATE_LIMIT',429);
 const config=workflowBridgeConfig(),token=workflowIdentityToken(identity,config,q.teamId);let response:Response;
 try{response=await fetch(config.origin+'/v1/orders/'+q.orderId,{headers:{authorization:'Bearer '+token},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});}catch{throw new IntegrationError('WORKFLOW_SERVICE_UNAVAILABLE');}
 if(!response.ok)throw new IntegrationError(response.status===404?'TASK_NOT_FOUND':'WORKFLOW_SCOPE_REQUIRED',response.status);
 const {order}=await response.json() as {order:WorkOrder},task=order.tasks.find(t=>t.id===q.taskId);if(!task)throw new IntegrationError('TASK_NOT_FOUND',404);
 return {identity,config,token,order,task,adapter:new CreationAdapter(identity.sourceSubject,deploymentPolicy())};
}
function mediaPath(r:IntegratedRecord,q:z.infer<typeof query>){
 return {...r,media:{available:r.media.available,href:r.media.available?'/api/enterprise/workflow/source?'+new URLSearchParams({action:'media',enterpriseId:q.enterpriseId,teamId:q.teamId,orderId:q.orderId,taskId:q.taskId,kind:'artwork',id:r.ref.id}):null}};
}
export async function GET(request:Request){
 const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return teamJson({error:'INVALID_SOURCE_QUERY'},400);
 try{const q=parsed.data,{identity,task,adapter}=await prepare(request,q);
  if(q.action==='candidates'){const data=await adapter.records({...q,size:20});return teamJson({...data,rows:data.rows.map(r=>mediaPath(r,q))});}
  if(q.action==='record'||q.action==='media'){const ref={instanceId:identity.sourceInstance,enterpriseId:identity.sourceEnterprise,kind:q.kind,id:q.id};if(q.action==='media')return enterpriseMediaResponse(request,await adapter.media(ref));return teamJson({record:mediaPath(await adapter.record(ref),q)});}
  const entries=[];for(const link of task.sourceLinks??[]){try{const record=await adapter.record(link.ref);entries.push({link,available:true as const,record:mediaPath(record,q)});}catch(e){if(e instanceof IntegrationError&&[404,409].includes(e.status)||e instanceof TeamError&&[403,404].includes(e.status))entries.push({link,available:false as const,error:'SOURCE_NOT_AVAILABLE_TO_VIEWER'});else throw e;}}
  const visible=entries.flatMap(e=>e.available?[e.record as Awaited<ReturnType<CreationAdapter['record']>>]:[]);
  return teamJson({entries,summary:linkedLedgerSummary(visible,entries.length-visible.length),generatedAt:new Date().toISOString()});
 }catch(e){if(e instanceof IntegrationError)return teamJson({error:e.code},e.status);return teamFailure(e);}
}
export async function POST(request:Request){
 const scopeQuery=z.strictObject({enterpriseId:scope.enterpriseId,teamId:scope.teamId}).safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!scopeQuery.success)return teamJson({error:'INVALID_SOURCE_QUERY'},400);
 if(!workflowSameOrigin(request))return teamJson({error:'ORIGIN_REQUIRED'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return teamJson({error:'JSON_REQUIRED'},415);
 try{
  const chunks:Uint8Array[]=[];let size=0;const reader=request.body?.getReader();if(reader)for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>16384){await reader.cancel();return teamJson({error:'BODY_TOO_LARGE'},413);}chunks.push(r.value);}
  let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return teamJson({error:'INVALID_JSON'},400);}
  const parsed=commandSchema.safeParse(raw);if(!parsed.success||!['link-source','unlink-source'].includes(parsed.data.action.type))return teamJson({error:'INVALID_SOURCE_COMMAND'},400);
  const command=parsed.data as Command&{action:Extract<Command['action'],{type:'link-source'|'unlink-source'}>};
  const q={action:'links' as const,...scopeQuery.data,orderId:command.orderId,taskId:command.action.taskId},{identity,config,token,adapter}=await prepare(request,q);let proof='';
  if(command.action.type==='link-source'){
   const record=await adapter.record(command.action.ref);if(record.ref.enterpriseId!==identity.sourceEnterprise||record.ref.instanceId!==identity.sourceInstance)throw new IntegrationError('SOURCE_REF_MISMATCH',409);
   const encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url'),iat=Math.floor(Date.now()/1000),unsigned=encode({alg:'EdDSA',typ:'JWT',kid:config.kid})+'.'+encode({iss:'naumi-workflow-bff',aud:'enterprise-workflow-source-evidence',sourceInstance:identity.sourceInstance,sourceEnterprise:identity.sourceEnterprise,sourceViewer:identity.sourceSubject,sourceSubject:record.account.email,teamId:q.teamId,digest:sourceCommandDigest(command),iat,exp:iat+45});proof=unsigned+'.'+sign(null,Buffer.from(unsigned),config.key).toString('base64url');
  }
  let response:Response;try{response=await fetch(config.origin+'/v1/commands',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',...(proof?{'x-workflow-source-evidence':proof}:{})},body:JSON.stringify(command),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{return teamJson({error:'WORKFLOW_WRITE_UNCERTAIN'},503);}
  if(!response.headers.get('content-type')?.includes('application/json'))return teamJson({error:'WORKFLOW_RESPONSE_INVALID'},502);return teamJson(await response.json(),response.status);
 }catch(e){if(e instanceof IntegrationError)return teamJson({error:e.code},e.status);return teamFailure(e);}
}
