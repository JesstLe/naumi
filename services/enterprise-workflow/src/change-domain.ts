import {createHash} from 'node:crypto';
import {WorkflowError,type Actor,type WorkOrder} from './contracts';
import type {ChangeAction,ChangePatch,ChangeRequest,ChangeImpact} from './change-contracts';
const need=(v:unknown,c:string,s=409):void=>{if(!v)throw new WorkflowError(s,c);};
const stable=(v:unknown):string=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+stable(x)).join(',')+'}':JSON.stringify(v);
export const isChangeAction=(s:string)=>['propose-change','approve-change','reject-change','withdraw-change','apply-change'].includes(s);
export function changeBaseline(o:WorkOrder){const {changes,version,updatedAt,...business}=o;return createHash('sha256').update(stable(business)).digest('hex');}
const member=(a:Actor,p:string)=>a.permissions.includes(p as 'manage');
export const changeBusiness=(a:Actor,o:WorkOrder)=>a.enterpriseId===o.enterpriseId&&a.teamId===(o.requestTeamId??o.teamId)&&(member(a,'manage')||a.subject===o.requester&&member(a,'request'));
export const changeExecution=(a:Actor,o:WorkOrder)=>a.enterpriseId===o.enterpriseId&&a.teamId===o.teamId&&member(a,'dispatch');
export function changeCanApprove(a:Actor,o:WorkOrder,c:ChangeRequest,side:'business'|'execution'){
 const contributors=o.tasks.filter(t=>c.impact.taskIds.includes(t.id)).flatMap(t=>[t.assignee,...(t.handoverHistory??[]).filter(h=>h.outcome==='accepted').flatMap(h=>[h.from,h.to])]);
 return a.subject!==c.proposedBy&&!contributors.includes(a.subject)&&(side==='business'?changeBusiness(a,o):changeExecution(a,o));
}
export function changeControls(a:Actor,o:WorkOrder,enabled:boolean){return {enabled,canPropose:enabled&&['approved','active'].includes(o.status)&&(changeBusiness(a,o)||changeExecution(a,o)),items:(o.changes??[]).map(c=>{const pending=['proposed','approved'].includes(c.status),current=c.baselineHash===changeBaseline(o);return {id:c.id,current,approveBusiness:enabled&&pending&&current&&!c.approvals.some(p=>p.side==='business'||p.subject===a.subject)&&changeCanApprove(a,o,c,'business'),approveExecution:enabled&&pending&&current&&!c.approvals.some(p=>p.side==='execution'||p.subject===a.subject)&&changeCanApprove(a,o,c,'execution'),apply:enabled&&c.status==='approved'&&current&&changeExecution(a,o),reject:enabled&&pending&&(changeBusiness(a,o)||changeExecution(a,o)),withdraw:enabled&&pending&&a.subject===c.proposedBy};})};}
export function changeImpact(o:WorkOrder,patch:ChangePatch,at:string):ChangeImpact{
 need(['approved','active'].includes(o.status),'CHANGE_ORDER_STATE');
 const fields:ChangeImpact['fields']=[],ids=new Set<string>();
 if(patch.requirement){for(const [field,after]of Object.entries(patch.requirement)){const before=o[field as 'title'|'brief'|'acceptance'];if(before!==after)fields.push({taskId:null,field,before,after:after!});}if(fields.length)for(const t of o.tasks)ids.add(t.id);}
 let deltaPoints=0;
 for(const p of patch.tasks){const t=o.tasks.find(t=>t.id===p.taskId);need(t,'CHANGE_TASK_NOT_FOUND',404);if(!t)throw new WorkflowError(404,'CHANGE_TASK_NOT_FOUND');
  for(const field of ['title','points','dueAt'] as const){const after=p[field];if(after===undefined||after===t[field])continue;fields.push({taskId:t.id,field,before:t[field],after});ids.add(t.id);if(field==='points')deltaPoints+=Number(after)-t.points;if(field==='dueAt')need(Date.parse(String(after))>Date.parse(at),'CHANGE_DEADLINE_PAST');}
 }
 need(fields.length>0,'CHANGE_NO_DIFFERENCE');
 for(const t of o.tasks.filter(t=>ids.has(t.id))) {need(!['review','accepted'].includes(t.status),'CHANGE_REVIEW_OR_ACCEPTED_FROZEN');need(!t.pendingHandover,'HANDOVER_PENDING');}
 const downstream=new Set<string>();let changed=true;while(changed){changed=false;for(const t of o.tasks)if(!ids.has(t.id)&&!downstream.has(t.id)&&t.dependencyIds.some(d=>ids.has(d)||downstream.has(d))){downstream.add(t.id);changed=true;}}
 const due=(id:string)=>patch.tasks.find(p=>p.taskId===id)?.dueAt??o.tasks.find(t=>t.id===id)!.dueAt,warnings:ChangeImpact['warnings']=[];
 for(const t of o.tasks){if(ids.has(t.id)&&t.planEnd&&t.planEnd>new Date(Date.parse(due(t.id))+8*3600000).toISOString().slice(0,10))warnings.push({taskId:t.id,code:'PLAN_AFTER_NEW_DUE'});if((ids.has(t.id)||downstream.has(t.id))&&t.dependencyIds.some(d=>Date.parse(due(d))>Date.parse(due(t.id))))warnings.push({taskId:t.id,code:'DEPENDENCY_DUE_CONFLICT'});}
 return {fields,taskIds:[...ids],downstreamIds:[...downstream],deltaPoints,warnings,scheduleAutomaticallyChanged:false};
}
export function evolveChange(o:WorkOrder,a:Actor,x:ChangeAction,at:string){
 const changes=o.changes??=[];
 if(x.type==='propose-change'){
  need(changeBusiness(a,o)||changeExecution(a,o),'CHANGE_PROPOSE_FORBIDDEN',403);need(changes.length<20,'CHANGE_HISTORY_LIMIT');need(!changes.some(c=>c.id===x.changeId),'CHANGE_ID_REUSED');need(changes.filter(c=>['proposed','approved'].includes(c.status)).length<10,'CHANGE_PENDING_LIMIT');
  const impact=changeImpact(o,x.patch,at),c:ChangeRequest={id:x.changeId,status:'proposed',proposedBy:a.subject,proposedAt:at,reason:x.reason,baselineVersion:o.version,baselineHash:changeBaseline(o),patch:x.patch,impact,approvals:[]};changes.push(c);return {change:c};
 }
 const c=changes.find(c=>c.id===x.changeId);if(!c)throw new WorkflowError(404,'CHANGE_NOT_FOUND');need(['proposed','approved'].includes(c.status),'CHANGE_ALREADY_RESOLVED');
 if(x.type==='withdraw-change'||x.type==='reject-change'){
  need(x.type==='withdraw-change'?a.subject===c.proposedBy:changeBusiness(a,o)||changeExecution(a,o),'CHANGE_DECISION_FORBIDDEN',403);
  c.status=x.type==='withdraw-change'?'withdrawn':'rejected';c.resolution={actor:a.subject,at,reason:x.reason,version:o.version+1};return {change:c};
 }
 need(c.baselineHash===changeBaseline(o),'CHANGE_BASELINE_STALE');changeImpact(o,c.patch,at);
 if(x.type==='approve-change'){
  need(changeCanApprove(a,o,c,x.side),'CHANGE_INDEPENDENT_APPROVAL_REQUIRED',403);need(!c.approvals.some(v=>v.side===x.side),'CHANGE_SIDE_ALREADY_APPROVED');need(!c.approvals.some(v=>v.subject===a.subject),'CHANGE_TWO_PEOPLE_REQUIRED',403);
  c.approvals.push({side:x.side,subject:a.subject,teamId:a.teamId,...(a.sourceBinding?{sourceBinding:a.sourceBinding}:{}),at,reason:x.reason});if(c.approvals.length===2)c.status='approved';return {change:c};
 }
 need(changeExecution(a,o),'CHANGE_APPLY_FORBIDDEN',403);need(c.status==='approved'&&new Set(c.approvals.map(v=>v.side)).size===2,'CHANGE_BOTH_APPROVALS_REQUIRED');
 for(const t of o.tasks.filter(t=>c.impact.taskIds.includes(t.id)))t.commitmentBaseline??={title:t.title,points:t.points,dueAt:t.dueAt,firstChangeId:c.id};
 if(c.patch.requirement){o.requirementBaseline??={title:o.title,brief:o.brief,acceptance:o.acceptance,firstChangeId:c.id};Object.assign(o,c.patch.requirement);}
 for(const p of c.patch.tasks){const t=o.tasks.find(t=>t.id===p.taskId)!;if(!c.impact.fields.some(f=>f.taskId===t.id))continue;t.commitmentBaseline??={title:t.title,points:t.points,dueAt:t.dueAt,firstChangeId:c.id};const {taskId,...fields}=p;Object.assign(t,fields);}
 c.status='applied';c.resolution={actor:a.subject,at,reason:x.reason,version:o.version+1};return {change:c};
}
