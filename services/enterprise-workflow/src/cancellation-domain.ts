import {WorkflowError,type Actor,type WorkOrder} from './contracts';
import {changeBusiness,changeExecution} from './change-domain';
import type {CancellationAction,CancellationImpact,CancellationRequest} from './cancellation-contracts';
const need=(v:unknown,code:string,status=409):void=>{if(!v)throw new WorkflowError(status,code);};
export const isCancellation=(type:string)=>['request-cancellation','approve-cancellation','reject-cancellation','withdraw-cancellation','apply-cancellation'].includes(type);
export function cancellationApprover(a:Actor,o:WorkOrder,c:CancellationRequest,side:'business'|'execution'){
 const participants=o.tasks.flatMap(t=>[t.assignee,...(t.handoverHistory??[]).filter(h=>h.outcome==='accepted').flatMap(h=>[h.from,h.to])]);
 return a.subject!==c.proposedBy&&!participants.includes(a.subject)&&(side==='business'?changeBusiness(a,o):changeExecution(a,o));
}
export function cancellationControls(a:Actor,o:WorkOrder,enabled:boolean){return {enabled,canRequest:enabled&&['approved','active','paused'].includes(o.status)&&(changeBusiness(a,o)||changeExecution(a,o)),items:(o.cancellations??[]).map(c=>{const pending=['proposed','approved'].includes(c.status);return {id:c.id,approveBusiness:enabled&&pending&&!c.approvals.some(v=>v.side==='business'||v.subject===a.subject)&&cancellationApprover(a,o,c,'business'),approveExecution:enabled&&pending&&!c.approvals.some(v=>v.side==='execution'||v.subject===a.subject)&&cancellationApprover(a,o,c,'execution'),apply:enabled&&c.status==='approved'&&a.teamId===o.teamId&&a.permissions.includes('manage'),reject:enabled&&pending&&(changeBusiness(a,o)||changeExecution(a,o)),withdraw:enabled&&pending&&a.subject===c.proposedBy};})};}
export function evolveCancellation(o:WorkOrder,a:Actor,x:CancellationAction,at:string,impact?:CancellationImpact){
 const rows=o.cancellations??=[];
 if(x.type==='request-cancellation'){
  need(['approved','active','paused'].includes(o.status),'CANCELLATION_ORDER_STATE');need(changeBusiness(a,o)||changeExecution(a,o),'CANCELLATION_PROPOSE_FORBIDDEN',403);need(rows.length<20,'CANCELLATION_HISTORY_LIMIT');need(!rows.some(c=>c.id===x.cancellationId),'CANCELLATION_ID_REUSED');need(!rows.some(c=>['proposed','approved'].includes(c.status)),'CANCELLATION_ALREADY_PENDING');need(impact&&impact.hash===x.impactHash,'CANCELLATION_PREVIEW_CHANGED');
  const c:CancellationRequest={id:x.cancellationId,category:x.category,status:'proposed',proposedBy:a.subject,proposedAt:at,reason:x.reason,baselineVersion:o.version,impact:impact!,approvals:[]};rows.push(c);return {cancellation:c};
 }
 const c=rows.find(c=>c.id===x.cancellationId);if(!c)throw new WorkflowError(404,'CANCELLATION_NOT_FOUND');need(['proposed','approved'].includes(c.status),'CANCELLATION_ALREADY_RESOLVED');
 if(x.type==='reject-cancellation'||x.type==='withdraw-cancellation'){need(x.type==='withdraw-cancellation'?a.subject===c.proposedBy:changeBusiness(a,o)||changeExecution(a,o),'CANCELLATION_DECISION_FORBIDDEN',403);c.status=x.type==='withdraw-cancellation'?'withdrawn':'rejected';c.resolution={actor:a.subject,at,reason:x.reason,version:o.version+1};return {cancellation:c};}
 need(['approved','active','paused'].includes(o.status),'CANCELLATION_ORDER_STATE');need(impact&&impact.hash===c.impact.hash,'CANCELLATION_IMPACT_STALE');
 if(x.type==='approve-cancellation'){need(cancellationApprover(a,o,c,x.side),'CANCELLATION_INDEPENDENT_APPROVAL',403);need(!c.approvals.some(v=>v.side===x.side),'CANCELLATION_SIDE_APPROVED');need(!c.approvals.some(v=>v.subject===a.subject),'CANCELLATION_TWO_PEOPLE_REQUIRED',403);c.approvals.push({side:x.side,subject:a.subject,teamId:a.teamId,...(a.sourceBinding?{sourceBinding:a.sourceBinding}:{}),at,reason:x.reason});if(c.approvals.length===2)c.status='approved';return {cancellation:c};}
 need(a.teamId===o.teamId&&a.permissions.includes('manage'),'CANCELLATION_APPLY_FORBIDDEN',403);need(c.status==='approved'&&new Set(c.approvals.map(v=>v.side)).size===2,'CANCELLATION_BOTH_APPROVALS_REQUIRED');
 const handovers=[];for(const t of o.tasks){if(t.pendingHandover){const h={...t.pendingHandover,outcome:'cancelled' as const,resolvedBy:a.subject,resolvedAt:at,resolutionReason:'需求经双方批准取消：'+x.reason};t.handoverHistory=[...(t.handoverHistory??[]),h];t.pendingHandover=null;handovers.push({taskId:t.id,handover:h});}}
 const changes=[];for(const change of o.changes??[]){if(['proposed','approved'].includes(change.status)){change.status='superseded';change.resolution={actor:a.subject,at,reason:'需求经双方批准取消：'+x.reason,version:o.version+1};changes.push(change.id);}}
 for(const p of o.pauses??[])if(['proposed','approved'].includes(p.status)){p.status='rejected';p.resolution={actor:a.subject,at,reason:'需求取消：'+x.reason,version:o.version+1};}const period=o.pausePeriods?.at(-1);if(period&&!period.endedAt){period.endedAt=at;period.cancelled=true;}
 o.status='cancelled';c.status='applied';c.resolution={actor:a.subject,at,reason:x.reason,version:o.version+1};return {cancellation:c,closedHandovers:handovers,supersededChangeIds:changes,filesDeleted:0,contributionFactsChanged:0,externalRequests:0};
}
