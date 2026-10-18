import {WorkflowError,type Actor,type WorkOrder} from './contracts';
import {changeBusiness,changeExecution} from './change-domain';
import type {PauseAction,PauseImpact,PauseRequest} from './pause-contracts';
const need=(v:unknown,code:string,status=409):void=>{if(!v)throw new WorkflowError(status,code);};
export const isPause=(type:string)=>['request-pause','approve-pause','reject-pause','withdraw-pause','apply-pause'].includes(type);
export function pauseApprover(a:Actor,o:WorkOrder,c:PauseRequest,side:'business'|'execution'){
 const participants=o.tasks.flatMap(t=>[t.assignee,...(t.handoverHistory??[]).filter(h=>h.outcome==='accepted').flatMap(h=>[h.from,h.to])]);
 return a.subject!==c.proposedBy&&!participants.includes(a.subject)&&(side==='business'?changeBusiness(a,o):changeExecution(a,o));
}
export function pauseControls(a:Actor,o:WorkOrder,enabled:boolean){return {enabled,canRequest:enabled&&['active','paused'].includes(o.status)&&(changeBusiness(a,o)||changeExecution(a,o)),items:(o.pauses??[]).map(c=>{const pending=['proposed','approved'].includes(c.status);return {id:c.id,approveBusiness:enabled&&pending&&!c.approvals.some(v=>v.side==='business'||v.subject===a.subject)&&pauseApprover(a,o,c,'business'),approveExecution:enabled&&pending&&!c.approvals.some(v=>v.side==='execution'||v.subject===a.subject)&&pauseApprover(a,o,c,'execution'),apply:enabled&&c.status==='approved'&&a.teamId===o.teamId&&a.permissions.includes('manage'),reject:enabled&&pending&&(changeBusiness(a,o)||changeExecution(a,o)),withdraw:enabled&&pending&&a.subject===c.proposedBy};})};}
export function evolvePause(o:WorkOrder,a:Actor,x:PauseAction,at:string,impact?:PauseImpact){
 const rows=o.pauses??=[];
 if(x.type==='request-pause'){
  need(['active','paused'].includes(o.status),'PAUSE_ORDER_STATE');need(changeBusiness(a,o)||changeExecution(a,o),'PAUSE_PROPOSE_FORBIDDEN',403);need(rows.length<20,'PAUSE_HISTORY_LIMIT');need(!rows.some(c=>c.id===x.pauseId),'PAUSE_ID_REUSED');need(!rows.some(c=>['proposed','approved'].includes(c.status)),'PAUSE_ALREADY_PENDING');need(o.status===(x.mode==='pause'?'active':'paused'),'PAUSE_MODE_STATE');need(impact&&impact.hash===x.impactHash,'PAUSE_PREVIEW_CHANGED');
  const c:PauseRequest={id:x.pauseId,mode:x.mode,status:'proposed',proposedBy:a.subject,proposedAt:at,reason:x.reason,baselineVersion:o.version,impact:impact!,approvals:[]};rows.push(c);return {pause:c};
 }
 const c=rows.find(c=>c.id===x.pauseId);if(!c)throw new WorkflowError(404,'PAUSE_NOT_FOUND');need(['proposed','approved'].includes(c.status),'PAUSE_ALREADY_RESOLVED');
 if(x.type==='reject-pause'||x.type==='withdraw-pause'){need(x.type==='withdraw-pause'?a.subject===c.proposedBy:changeBusiness(a,o)||changeExecution(a,o),'PAUSE_DECISION_FORBIDDEN',403);c.status=x.type==='withdraw-pause'?'withdrawn':'rejected';c.resolution={actor:a.subject,at,reason:x.reason,version:o.version+1};return {pause:c};}
 need(['active','paused'].includes(o.status),'PAUSE_ORDER_STATE');need(o.status===(c.mode==='pause'?'active':'paused'),'PAUSE_MODE_STATE');need(impact&&impact.hash===c.impact.hash,'PAUSE_IMPACT_STALE');
 if(x.type==='approve-pause'){need(pauseApprover(a,o,c,x.side),'PAUSE_INDEPENDENT_APPROVAL',403);need(!c.approvals.some(v=>v.side===x.side),'PAUSE_SIDE_APPROVED');need(!c.approvals.some(v=>v.subject===a.subject),'PAUSE_TWO_PEOPLE_REQUIRED',403);c.approvals.push({side:x.side,subject:a.subject,teamId:a.teamId,...(a.sourceBinding?{sourceBinding:a.sourceBinding}:{}),at,reason:x.reason});if(c.approvals.length===2)c.status='approved';return {pause:c};}
 need(a.teamId===o.teamId&&a.permissions.includes('manage'),'PAUSE_APPLY_FORBIDDEN',403);need(c.status==='approved'&&new Set(c.approvals.map(v=>v.side)).size===2,'PAUSE_BOTH_APPROVALS_REQUIRED');
 if(c.mode==='pause'){o.status='paused';(o.pausePeriods??=[]).push({pauseId:c.id,startedAt:at});}else{const period=o.pausePeriods?.at(-1);need(period&&!period.endedAt,'PAUSE_PERIOD_MISSING');period!.endedAt=at;period!.resumeId=c.id;o.status='active';}
 c.status='applied';c.resolution={actor:a.subject,at,reason:x.reason,version:o.version+1};return {pause:c,capacityPolicy:'reserve-wip-and-planned-hours',plansChanged:0,dueDatesChanged:0,externalRequests:0};
}
