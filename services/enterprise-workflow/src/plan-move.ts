import {capacityProjection} from './capacity-store';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {id,calendarDate,WorkflowError,type Actor,type WorkOrder} from './contracts';
import {calendarDays,allocateHours,dayMinutes,legacyCalendar,moveDates} from './calendar';
import {loadCalendars} from './calendar-store';
import {loadAvailability,availabilityKey,capacityMinutes} from './availability-store';
import {sourceDigest} from './source-files';
import {canRead} from './domain';

export const moveInput=z.strictObject({orderId:id,taskId:id,expectedVersion:z.number().int().positive(),targetStart:calendarDate,reason:z.string().trim().min(1).max(2000)});
export async function previewMove(tx:PoolClient,a:Actor,input:z.infer<typeof moveInput>,personalEnabled:boolean,globalEnabled=false){
 const o=(await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,input.orderId])).rows[0]?.document as WorkOrder|undefined;
 if(!o||!canRead(a,o))throw new WorkflowError(404,'NOT_FOUND');
 if(!a.teamId||a.teamId!==o.teamId)throw new WorkflowError(403,'EXECUTION_TEAM_REQUIRED');
 if(!a.permissions.includes('dispatch'))throw new WorkflowError(403,'FORBIDDEN');
 if(o.version!==input.expectedVersion)throw new WorkflowError(409,'VERSION_CONFLICT');
 if(!['approved','active'].includes(o.status))throw new WorkflowError(409,'INVALID_ORDER_STATE');
 const t=o.tasks.find(t=>t.id===input.taskId);
 if(!t)throw new WorkflowError(404,'TASK_NOT_FOUND');
 if(t.status==='accepted')throw new WorkflowError(409,'ACCEPTED_PLAN_IMMUTABLE');
 if(t.pendingHandover)throw new WorkflowError(409,'HANDOVER_PENDING');
 if(!t.planStart||!t.planEnd||!t.estimatedHours)throw new WorkflowError(409,'PLAN_REQUIRED');
 if(t.planStart===input.targetStart)throw new WorkflowError(409,'PLAN_MOVE_NO_CHANGE');
 const proposed=moveDates(t.planStart,t.planEnd,input.targetStart),days=[...new Set([...calendarDays(t.planStart,t.planEnd),...calendarDays(proposed.planStart,proposed.planEnd)])].sort();
 const calendar=(await loadCalendars(tx,a.enterpriseId,[a.teamId])).get(a.teamId)??legacyCalendar();
 const enabled=personalEnabled&&!!(await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=17')).rowCount;
 const personal=t.assignee?(await loadAvailability(tx,a.enterpriseId,[{teamId:a.teamId,subject:t.assignee}],enabled)).get(availabilityKey(a.teamId,t.assignee)):undefined;
 const rows=(await tx.query(`SELECT o.id,o.version,t AS task FROM enterprise_workflow.orders o CROSS JOIN LATERAL jsonb_array_elements(o.document->'tasks') t WHERE o.enterprise_id=$1 AND o.document->>'teamId'=$2 AND o.document->>'status' IN ('approved','active','completed') AND (t->>'assignee') IS NOT DISTINCT FROM $3::text AND ((t->>'planStart'<=$5 AND t->>'planEnd'>=$4) OR (t->>'planStart'<=$7 AND t->>'planEnd'>=$6)) ORDER BY o.id,t->>'id' LIMIT 1001`,[a.enterpriseId,a.teamId,t.assignee,t.planStart,t.planEnd,proposed.planStart,proposed.planEnd])).rows as {id:string;version:number;task:WorkOrder['tasks'][number]}[];
 if(rows.length>1000)throw new WorkflowError(422,'PLAN_MOVE_IMPACT_TOO_LARGE');
 const loads:Record<string,number>={};
 for(const row of rows){const task=row.task;const allocation=allocateHours(calendar.config,task.planStart!,task.planEnd!,task.estimatedHours||0);for(const date of days)loads[date]=(loads[date]||0)+(allocation.byDay[date]||0);}
 const before=allocateHours(calendar.config,t.planStart,t.planEnd,t.estimatedHours),after=allocateHours(calendar.config,proposed.planStart,proposed.planEnd,t.estimatedHours);
 const daily=days.map(date=>{const capacity=t.assignee?capacityMinutes(dayMinutes(calendar.config,date),personal,date).minutes/60:null,old=loads[date]||0,next=Math.max(0,old-(before.byDay[date]||0)+(after.byDay[date]||0));return {date,beforeHours:old,afterHours:next,capacityHours:capacity,overloaded:capacity!==null&&next>capacity+1e-9,taskBefore:before.byDay[date]||0,taskAfter:after.byDay[date]||0};});
 const dependencies=o.tasks.filter(x=>x.id!==t.id&&x.status!=='accepted').flatMap<{taskId:string;title:string;kind:'predecessor'|'successor';date:string|null}>(x=>t.dependencyIds.includes(x.id)?(!x.planEnd||x.planEnd>=proposed.planStart?[{taskId:x.id,title:x.title,kind:'predecessor' as const,date:x.planEnd??null}]:[]):x.dependencyIds.includes(t.id)?(!x.planStart||x.planStart<=proposed.planEnd?[{taskId:x.id,title:x.title,kind:'successor' as const,date:x.planStart??null}]:[]):[]);
 const dueDate=new Date(Date.parse(t.dueAt)+8*3600000).toISOString().slice(0,10);
 const impact={days:daily,conflictDays:daily.filter(d=>d.overloaded).length,noWorkingDay:after.noWorkingDay,afterDue:proposed.planEnd>dueDate,dependencies,relatedTasks:rows.length};
 let globalCapacity;let globalBasis=null;if(globalEnabled&&t.assignee&&(await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=26')).rowCount&&(await tx.query("SELECT 1 FROM enterprise_workflow.team_members m JOIN enterprise_workflow.accounts a USING(enterprise_id,subject) WHERE m.enterprise_id=$1 AND m.team_id=$2 AND m.subject=$3 AND m.enabled AND a.enabled AND (m.expires_at IS NULL OR m.expires_at>now()) AND (a.expires_at IS NULL OR a.expires_at>now()) AND m.permissions ? 'execute'",[a.enterpriseId,a.teamId,t.assignee])).rowCount){const before=await capacityProjection(tx,a,t.assignee,days),after=await capacityProjection(tx,a,t.assignee,days,{order:o,task:{...t,...proposed}});globalCapacity={configured:!!before.policy.config,wip:before.wip,days:before.days.map((d,i)=>({date:d.date,beforeHours:d.totalHours,afterHours:after.days[i].totalHours,otherTeamsHours:d.otherTeamsHours,capacityMinutes:d.capacityMinutes,overloaded:after.days[i].overloaded})),noWorkingDayTasks:after.noWorkingDayTasks,unplannedTasks:after.unplannedTasks,capacityReservation:false};globalBasis=[before.basisHash,after.basisHash];}
 const basis={globalBasis,principal:{enterpriseId:a.enterpriseId,teamId:a.teamId,subject:a.subject},input,order:o.version,calendar,personal:personal??null,enabled,plans:rows.map(r=>({orderId:r.id,version:r.version,taskId:r.task.id}))};
 return {...(globalCapacity?{globalCapacity}:{}),previewHash:sourceDigest(basis),orderId:o.id,taskId:t.id,title:t.title,expectedVersion:o.version,assignee:t.assignee,before:{planStart:t.planStart,planEnd:t.planEnd},proposed,estimatedHours:t.estimatedHours,dueAt:t.dueAt,calendarRevision:calendar.revision,calendarConfigured:calendar.configured,availabilityRevision:personal?.revision||0,availabilityEnabled:enabled,impact,timezone:'Asia/Shanghai',capacityScope:'execution-team-person',capacityReservation:false};
}
