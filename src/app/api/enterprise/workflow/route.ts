import {workflowSameOrigin} from '@/lib/enterprise/workflow-origin';
import { z } from 'zod';
import { workflowBridgeConfig,workflowIdentityToken,workflowSourceIdentity,workflowDiscovery } from '@/lib/enterprise/workflow-identity';
import { teamJson,teamFailure } from '@/lib/teams/access';
import { IntegrationError } from '@/lib/enterprise/integration/policy';
import { rateLimit } from '@/lib/rate-limit';
export const runtime='nodejs';export const dynamic='force-dynamic';
const scope={enterpriseId:z.string().uuid(),teamId:z.string().uuid()};
const query=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('discovery')}),
 z.strictObject({action:z.literal('handover-candidates'),...scope,page:z.coerce.number().int().min(1).max(10000).optional()}),
 z.strictObject({action:z.literal('imports-context'),...scope}),
 z.strictObject({action:z.literal('imports-rows'),...scope,source:z.string().regex(/^[a-f0-9]{64}$/)}),
 z.strictObject({action:z.enum(['worksheet','worksheet-audit']),...scope,source:z.string().regex(/^[a-f0-9]{64}$/),before:z.coerce.number().int().positive().optional()}),
 z.strictObject({action:z.literal('batch-receipts'),...scope}),
 z.strictObject({action:z.literal('availability-members'),...scope,query:z.string().max(120).optional(),page:z.coerce.number().int().min(1).max(10000).optional()}),
 z.strictObject({action:z.literal('availability'),...scope,subject:z.string().min(1).max(254)}),
 z.strictObject({action:z.literal('availability-history'),...scope,subject:z.string().min(1).max(254),page:z.coerce.number().int().min(1).max(10000).optional()}),
 z.strictObject({action:z.literal('calendar'),...scope}),
 z.strictObject({action:z.literal('calendar-history'),...scope,page:z.coerce.number().int().min(1).max(10000).optional()}),
 z.strictObject({action:z.literal('batch-list'),...scope,page:z.coerce.number().int().min(1).max(10000).optional()}),
 z.strictObject({action:z.literal('batch-get'),...scope,id:z.string().uuid()}),
 z.strictObject({action:z.literal('history'),...scope,id:z.string().uuid(),before:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)}),
 z.strictObject({action:z.literal('dashboard'),...scope,scope:z.enum(['all','mine']).optional(),queue:z.enum(['all','pending','running','review','accepted','overdue','today']).optional(),todoPage:z.coerce.number().int().min(1).max(10000).optional()}),
 z.strictObject({action:z.literal('facts'),...scope,page:z.coerce.number().int().min(1).max(10000).optional()}),
 z.strictObject({action:z.literal('schedule'),...scope}),
 z.strictObject({action:z.literal('schedule-audit'),...scope}),
 z.strictObject({action:z.literal('personal'),...scope,viewId:z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)}),
 z.strictObject({action:z.literal('week'),...scope,start:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),assignee:z.string().max(254).optional()}),
 z.strictObject({action:z.literal('context'),enterpriseId:z.string().uuid()}),
 z.strictObject({action:z.literal('people'),...scope,sourceHash:z.string().regex(/^[a-f0-9]{64}$/)}),
 z.strictObject({action:z.literal('people-audit'),...scope}),
 z.strictObject({action:z.literal('orders'),...scope,query:z.string().max(120).optional(),status:z.enum(['','draft','submitted','approved','active','paused','completed','cancelled','archived']).optional(),page:z.coerce.number().int().min(1).max(10000).optional()}),
 z.strictObject({action:z.literal('order'),...scope,id:z.string().uuid()}),
 z.strictObject({action:z.literal('tasks'),...scope,assignee:z.string().max(254).optional(),query:z.string().max(120).optional(),status:z.enum(['','open','assigned','claimed','in_progress','blocked','review','rework','accepted']).optional(),scope:z.enum(['all','mine','claimable','handover']).optional(),page:z.coerce.number().int().min(1).max(10000).optional()}),
 z.strictObject({action:z.literal('assignees'),...scope,query:z.string().max(120).optional(),kind:z.enum(['','design','artwork']).optional(),page:z.coerce.number().int().min(1).max(10000).optional()}),
]);
export async function GET(request:Request){
 const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return teamJson({error:'工作区参数无效'},400);
 try{
  if(parsed.data.action==='discovery'){const data=await workflowDiscovery(request);if(!rateLimit('workflow-discovery:'+data.viewer.email,30,60_000))return teamJson({error:'请求过于频繁'},429);return teamJson(data);}
  const identity=await workflowSourceIdentity(request,parsed.data.enterpriseId);
  if(!rateLimit('workflow-identity:'+JSON.stringify(identity),60,60_000))return teamJson({error:'请求过于频繁'},429);
  const config=workflowBridgeConfig();let response:Response;const q=parsed.data,path=q.action==='worksheet'||q.action==='worksheet-audit'?'/v1/imports/'+q.action+'?'+new URLSearchParams({source:q.source,...(q.before?{before:String(q.before)}:{})}):q.action==='handover-candidates'?'/v1/handover-candidates?page='+String(q.page||1):q.action==='availability-members'?'/v1/availability/members?'+new URLSearchParams({query:q.query||'',page:String(q.page||1)}):q.action==='availability'?'/v1/availability?'+new URLSearchParams({subject:q.subject}):q.action==='availability-history'?'/v1/availability/history?'+new URLSearchParams({subject:q.subject,page:String(q.page||1)}):q.action==='dashboard'?'/v1/dashboard?'+new URLSearchParams({scope:q.scope||'all',queue:q.queue||'all',todoPage:String(q.todoPage||1)}):q.action==='calendar'?'/v1/calendar':q.action==='calendar-history'?'/v1/calendar/history?page='+String(q.page||1):q.action==='batch-list'?'/v1/batches?page='+String(q.page||1):q.action==='batch-get'?'/v1/batch?id='+q.id:q.action==='imports-context'?'/v1/imports/context':q.action==='imports-rows'?'/v1/imports/rows?source='+q.source:q.action==='batch-receipts'?'/v1/batch-receipts':q.action==='history'?'/v1/orders/'+q.id+'/history?before='+q.before:q.action==='schedule'?'/v1/teams/'+q.teamId+'/scheduling':q.action==='schedule-audit'?'/v1/teams/'+q.teamId+'/scheduling/audit':q.action==='personal'?'/v1/teams/'+q.teamId+'/scheduling/personal/'+q.viewId:q.action==='week'?'/v1/week?'+new URLSearchParams({start:q.start,assignee:q.assignee||''}):q.action==='facts'?'/v1/facts?page='+String(q.page||1):q.action==='context'?'/v1/identity/workspaces':q.action==='people'?'/v1/people?source='+q.sourceHash:q.action==='orders'?'/v1/orders?'+new URLSearchParams({query:q.query||'',status:q.status||'',page:String(q.page||1)}):q.action==='order'?'/v1/orders/'+q.id+'/detail':q.action==='tasks'?'/v1/tasks?'+new URLSearchParams({query:q.query||'',status:q.status||'',scope:q.scope||'all',assignee:q.assignee||'',page:String(q.page||1)}):q.action==='assignees'?'/v1/assignees?'+new URLSearchParams({query:q.query||'',kind:q.kind||'',page:String(q.page||1)}):'/v1/people/audit';
  try{response=await fetch(config.origin+path,{headers:{authorization:'Bearer '+workflowIdentityToken(identity,config,'teamId' in q?q.teamId:undefined),Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.any([request.signal,AbortSignal.timeout(q.action==='dashboard'?15000:5000)])});}catch{return teamJson({error:'WORKFLOW_SERVICE_UNAVAILABLE'},503);}
  if(!response.ok&&q.action==='context')return teamJson({error:response.status===403?'WORKFLOW_IDENTITY_NOT_BOUND_OR_REVOKED':'WORKFLOW_SERVICE_UNAVAILABLE'},response.status===403?403:503);
  if(q.action!=='context'){if(!response.headers.get('content-type')?.includes('application/json'))return teamJson({error:'WORKFLOW_RESPONSE_INVALID'},502);return teamJson(await response.json(),response.status);}
  const schema=z.strictObject({enterpriseId:z.string().uuid(),subject:z.string().max(254),teams:z.array(z.strictObject({teamId:z.string().uuid(),name:z.string().max(120),permissions:z.array(z.enum(['request','dispatch','execute','review','manage'])),workKinds:z.array(z.enum(['design','artwork']))})).max(100)});
  const data=schema.safeParse(await response.json());if(!data.success)return teamJson({error:'WORKFLOW_RESPONSE_INVALID'},502);
  return teamJson({version:1,source:identity,workspace:data.data});
 }catch(e){if(e instanceof IntegrationError)return teamJson({error:e.code},e.status);return teamFailure(e);}
}
export async function POST(request:Request){
 const q=z.strictObject({source:z.string().regex(/^[a-f0-9]{64}$/).optional(),action:z.enum(['worksheet-command','worksheet-upload','pause-preview','cancellation-preview','change-preview','plan-move-preview','imports-resolve','people-roster-preview','people-roster-apply','people-profile','people-preview','people-apply','intake','command','schedule-command','batch-preview','batch-plan','batch-run','batch-close','calendar-preview','calendar-save','availability-preview','availability-save']),...scope}).safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!q.success)return teamJson({error:'工作区参数无效'},400);
 if(!workflowSameOrigin(request))return teamJson({error:'ORIGIN_REQUIRED'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return teamJson({error:'JSON_REQUIRED'},415);
 try{
  const identity=await workflowSourceIdentity(request,q.data.enterpriseId);if(!rateLimit('workflow-write:'+JSON.stringify(identity),60,60_000))return teamJson({error:'请求过于频繁'},429);
  const chunks:Uint8Array[]=[];let size=0;const reader=request.body?.getReader();if(reader)for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>(q.data.action==='worksheet-upload'?6*1024*1024:128*1024)){await reader.cancel();return teamJson({error:'BODY_TOO_LARGE'},413);}chunks.push(next.value);}const text=Buffer.concat(chunks).toString('utf8');try{JSON.parse(text);}catch{return teamJson({error:'INVALID_JSON'},400);}
  if(['imports-resolve','worksheet-command','worksheet-upload'].includes(q.data.action)&&!q.data.source)return teamJson({error:'INVALID_SOURCE'},400);
  const config=workflowBridgeConfig(),path={ 'worksheet-command':'/v1/imports/worksheet-command?source='+q.data.source,'worksheet-upload':'/v1/imports/worksheet-upload?source='+q.data.source,'pause-preview':'/v1/pause-preview','cancellation-preview':'/v1/cancellation-preview','change-preview':'/v1/change-preview','plan-move-preview':'/v1/plan-move/preview','availability-preview':'/v1/availability/preview','availability-save':'/v1/availability/save','people-roster-preview':'/v1/people/roster-preview','people-roster-apply':'/v1/people/roster-apply','imports-resolve':'/v1/imports/resolve?source='+q.data.source,'people-profile':'/v1/people/profile','people-preview':'/v1/people/preview','people-apply':'/v1/people/apply','calendar-preview':'/v1/calendar/preview','calendar-save':'/v1/calendar/save','batch-plan':'/v1/batch-plan','batch-run':'/v1/batch-run','batch-close':'/v1/batch-close','batch-preview':'/v1/batch-preview',intake:'/v1/intake',command:'/v1/commands','schedule-command':'/v1/scheduling/commands' }[q.data.action];let response:Response;
  try{response=await fetch(config.origin+path,{method:'POST',headers:{authorization:'Bearer '+workflowIdentityToken(identity,config,q.data.teamId),'content-type':'application/json'},body:text,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{return teamJson({error:'WORKFLOW_WRITE_UNCERTAIN',uncertain:true},503);}
  if(!response.headers.get('content-type')?.includes('application/json'))return teamJson({error:'WORKFLOW_RESPONSE_INVALID'},502);
  return teamJson(await response.json(),response.status);
 }catch(e){if(e instanceof IntegrationError)return teamJson({error:e.code},e.status);return teamFailure(e);}
}
