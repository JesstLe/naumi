import type {Actor,WorkOrder,WorkflowEvent,Task} from './contracts';
import {canRead,participants} from './domain';
import {sourceDigest} from './source-files';
import {slaNames,type SlaConfig,type SlaClock,type SlaRule} from './sla-contracts';
export function slaClocks(o:WorkOrder,events:WorkflowEvent[],members:Actor[],panels:Record<string,string[]>,config:SlaConfig,now:Date):SlaClock[]{
 if(!config.enabled||!o.teamId||!['active','submitted'].includes(o.status))return [];
 const result:SlaClock[]=[],team=members.filter(a=>a.enterpriseId===o.enterpriseId&&a.teamId===o.teamId&&canRead(a,o)),managers=team.filter(a=>a.permissions.some(p=>p==='manage'||p==='dispatch'));
 const event=(types:string[],t?:Task)=>events.filter(e=>{const a=e.data.action as any;return a&&types.includes(a.type)&&(!t||a.taskId===t.id||a.type==='publish'||a.type==='batch-tasks'&&a.operation?.type==='assign'&&a.taskIds?.includes(t.id));}).sort((a,b)=>b.aggregateVersion-a.aggregateVersion)[0];
 const executor=(t:Task,subject=t.assignee)=>team.filter(a=>a.subject===subject&&a.permissions.includes('execute')&&a.workKinds.includes(t.kind));
 const add=(r:SlaRule,t:Task|undefined,anchor:string|undefined,date:string|undefined,recipients:Actor[])=>{if(!anchor||!date||!Number.isFinite(Date.parse(date)))return;const base=Date.parse(date),first=base+(r.kind==='due'?-r.minutes:r.minutes)*60000,late=base+(r.kind==='due'?0:r.minutes)*60000,escalate=late+r.escalateMinutes*60000;let stage:0|1|2;if(+now>=escalate)stage=2;else if(+now>=late)stage=1;else if(r.kind==='due'&&+now>=first)stage=0;else return;const chosen=stage===2?managers:recipients,key=sourceDigest([o.enterpriseId,o.teamId,o.id,t?.id??null,r.kind,anchor]);result.push({key,kind:r.kind,orderId:o.id,taskId:t?.id??null,anchor,at:new Date(stage===2?escalate:stage===1?late:first).toISOString(),stage,title:slaNames[r.kind]+(stage===2?' · 超时升级':stage===0?' · 即将到期':' · 已超时'),recipients:[...new Set(chosen.map(a=>a.subject))].sort()});};
 for(const r of config.rules.filter(r=>r.enabled)){
  if(r.kind==='requirement'){if(o.status==='submitted'){const e=event(['submit-requirement']);add(r,undefined,e?.id,e?.occurredAt,managers);}continue;}
  if(o.status!=='active')continue;
  for(const t of o.tasks){
   if(t.status==='accepted')continue;
   if(r.kind==='due'&&t.status!=='review'){const own=executor(t);add(r,t,sourceDigest([new Date(t.dueAt).toISOString(),t.assignee,t.pendingHandover?.id??null]),t.dueAt,own.length?own:managers);}
   if(r.kind==='unclaimed'&&['open','assigned'].includes(t.status)){const e=event(['publish','release','assign','batch-tasks'],t),own=executor(t);add(r,t,e?.id,e?.occurredAt,own.length?own:managers);}
   if(r.kind==='blocked'&&t.status==='blocked'){const e=event(['block'],t);add(r,t,e?.id,e?.occurredAt,[...managers,...executor(t)]);}
   if(r.kind==='review'&&t.status==='review'){const e=event(['submit-delivery'],t),list=e?panels[e.id]:undefined;add(r,t,e?.id,e?.occurredAt,team.filter(a=>a.permissions.includes('review')&&!participants(t).includes(a.subject)&&(!list||list.includes(a.subject))));}
   if(r.kind==='handover'&&t.pendingHandover)add(r,t,t.pendingHandover.id,t.pendingHandover.requestedAt,executor(t,t.pendingHandover.to));
  }
 }
 return result.sort((a,b)=>a.key.localeCompare(b.key));
}
