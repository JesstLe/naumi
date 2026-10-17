import type {Actor,WorkOrder,WorkflowEvent} from './contracts';
import {canRead,participants} from './domain';
import {notificationTitles} from './notification-contracts';
export function notificationRecipients(order:WorkOrder,event:WorkflowEvent,members:Actor[]){
 const action=event.data.action as {type:string;taskId?:string;taskIds?:string[];operation?:{type:string}},type=action?.type;
 if(!type||!notificationTitles[type]||type==='batch-tasks'&&action.operation?.type!=='assign')return [];
 const task=order.tasks.find(t=>t.id===action.taskId),origin=order.requestTeamId??order.teamId;
 const chosen=members.filter(a=>{
  if(a.subject===event.actor||!canRead(a,order))return false;
  const exec=a.teamId===order.teamId,requester=a.teamId===origin&&a.subject===order.requester,dispatch=exec&&a.permissions.some(p=>p==='manage'||p==='dispatch');
  switch(type){
   case 'submit-requirement':case 'route-resolved':case 'claim':case 'block':case 'resume':return dispatch;
   case 'return-requirement':case 'approve-requirement':return requester;
   case 'publish':case 'release':return exec&&a.permissions.includes('execute')&&order.tasks.some(t=>t.status==='open'&&a.workKinds.includes(t.kind)&&(!action.taskId||t.id===action.taskId));
   case 'assign':case 'set-task-plan':case 'move-task-plan':case 'request-rework':return exec&&task?.assignee===a.subject;
   case 'batch-tasks':return exec&&order.tasks.some(t=>action.taskIds?.includes(t.id)&&t.assignee===a.subject);
   case 'submit-delivery':return exec&&!!task&&a.permissions.includes('review')&&!participants(task).includes(a.subject);
   case 'accept-delivery':return exec&&!!task&&participants(task).includes(a.subject)||requester&&order.status==='completed';
   case 'propose-handover':return exec&&!!task?.pendingHandover&&[task.pendingHandover.from,task.pendingHandover.to].includes(a.subject);
   case 'accept-handover':case 'decline-handover':case 'cancel-handover':{const h=event.data.handover as {from:string;to:string;requestedBy:string}|undefined;return exec&&!!h&&[h.from,h.to,h.requestedBy].includes(a.subject);}
   case 'operations-signoff':case 'operations-followup':return requester||dispatch;
   case 'cancel':return requester||exec&&order.tasks.some(t=>participants(t).includes(a.subject));
   default:return false;
  }
 });return chosen;
}
