import {moveDates} from './calendar';
import { createHash } from 'node:crypto';
import { WorkflowError, type Actor, type Command, type WorkOrder, type WorkflowEvent, type Permission, type Task } from './contracts';

function need(ok: unknown, code: string, status = 409): asserts ok {
  if (!ok) throw new WorkflowError(status, code);
}
export function has(actor: Actor, p: Permission) { return actor.permissions.includes(p); }
export const sourceKey=(r:{instanceId:string;enterpriseId:string;kind:string;id:string})=>JSON.stringify([r.instanceId,r.enterpriseId,r.kind,r.id]);
export function participants(t:Task){return [...new Set([t.assignee,...(t.handoverHistory??[]).filter(h=>h.outcome==='accepted').flatMap(h=>[h.from,h.to])].filter((s):s is string=>!!s))];}
export function requestSide(actor:Actor,order:WorkOrder){return actor.enterpriseId===order.enterpriseId&&!!order.requestTeamId&&actor.teamId===order.requestTeamId&&(order.requester===actor.subject||has(actor,'manage')||has(actor,'dispatch'));}
export function canRead(actor: Actor, order: WorkOrder) {
  if(requestSide(actor,order))return true;
  if ((actor.teamId !== undefined || order.teamId !== undefined) && actor.teamId !== order.teamId) return false;
  return actor.enterpriseId === order.enterpriseId && (has(actor, 'manage') || has(actor, 'dispatch') || has(actor, 'review') ||
    order.requester === actor.subject || order.tasks.some(t => participants(t).includes(actor.subject) || t.pendingHandover?.to===actor.subject) ||
    has(actor, 'execute') && order.status === 'active' && order.tasks.some(t => t.status === 'open' && actor.workKinds.includes(t.kind)));
}
export function evolve(previous: WorkOrder | null, actor: Actor, command: Command, at: string) {
  const action = command.action;
  const permit = (p: Permission) => need(has(actor, p), 'FORBIDDEN', 403);
  if (!previous) {
    need(action.type === 'create', 'NOT_FOUND', 404); permit('request');
    need(command.expectedVersion === 0, 'VERSION_CONFLICT');
    const order: WorkOrder = { id: command.orderId, enterpriseId: actor.enterpriseId, ...(actor.teamId ? { teamId: actor.teamId,requestTeamId:actor.teamId } : {}), requester: actor.subject,
      title: action.title, brief: action.brief, acceptance: action.acceptance,...(action.routingFields?{routingFields:action.routingFields}:{}), status: 'draft', version: 1,
      createdAt: at, updatedAt: at, tasks: [] };
    return { order, event: makeEvent(order, actor, command, at) };
  }
  need(previous.enterpriseId === actor.enterpriseId, 'NOT_FOUND', 404);
  need(previous.id === command.orderId, 'NOT_FOUND', 404);
  need(canRead(actor, previous), 'FORBIDDEN', 403);
  need(previous.version === command.expectedVersion, 'VERSION_CONFLICT');
  need(action.type !== 'create', 'ALREADY_EXISTS');
  if(actor.teamId!==previous.teamId&&!['operations-signoff','operations-followup'].includes(action.type))throw new WorkflowError(403,'EXECUTION_TEAM_REQUIRED');
  const order = structuredClone(previous);
  const state = (...allowed: WorkOrder['status'][]) => need(allowed.includes(order.status), 'INVALID_ORDER_STATE');
  const owner = () => need(order.requester === actor.subject || has(actor, 'manage'), 'FORBIDDEN', 403);
  let eventData: Record<string, unknown> = {};
  switch (action.type) {
    case 'revise-requirement': state('draft'); permit('request'); owner(); order.title = action.title; order.brief = action.brief; order.acceptance = action.acceptance;if(action.routingFields)order.routingFields=action.routingFields;delete order.routing;break;
    case 'submit-requirement': state('draft'); permit('request'); owner(); order.status = 'submitted'; break;
    case 'return-requirement': state('submitted'); permit('dispatch'); order.status = 'draft';order.teamId=order.requestTeamId??order.teamId;delete order.routing;break;
    case 'approve-requirement': state('submitted'); permit('dispatch');need(!order.routing||order.routing.status==='assigned','ROUTING_REVIEW_REQUIRED'); order.status = 'approved'; break;
    case 'operations-signoff': case 'operations-followup': {
      state('completed');need(!order.operations,'OPERATIONS_ALREADY_DECIDED');need(actor.teamId===(order.requestTeamId??order.teamId)&&(has(actor,'manage')||order.requester===actor.subject&&has(actor,'request')),'OPERATIONS_FORBIDDEN',403);
      need(!order.tasks.some(t=>participants(t).includes(actor.subject)),'INDEPENDENT_SIGNOFF_REQUIRED',403);
      order.operations={status:action.type==='operations-signoff'?'signed':'followup',actor:actor.subject,at,reason:action.reason,...(action.type==='operations-followup'?{followupId:action.followupId}:{}),assetIds:[...new Set(order.tasks.flatMap(t=>t.assetIds))]};break;
    }
    case 'plan-tasks': {
      state('approved'); permit('dispatch');
      const ids = new Set(action.tasks.map(t => t.id));
      need(ids.size === action.tasks.length, 'DUPLICATE_TASK');
      const specs = new Map(action.tasks.map(t => [t.id, t]));
      for (const t of action.tasks) {
        need(Date.parse(t.dueAt) > Date.parse(at), 'INVALID_DEADLINE');
        need(new Set(t.dependencyIds).size === t.dependencyIds.length && t.dependencyIds.every(d => ids.has(d) && d !== t.id), 'INVALID_DEPENDENCY');
      }
      const visiting = new Set<string>(), visited = new Set<string>();
      const visit = (current: string) => {
        need(!visiting.has(current), 'CYCLIC_DEPENDENCY');
        if (visited.has(current)) return;
        visiting.add(current);
        for (const d of specs.get(current)!.dependencyIds) visit(d);
        visiting.delete(current); visited.add(current);
      };
      for (const t of action.tasks) visit(t.id);
      need(order.tasks.every(t=>!t.sourceLinks?.length||ids.has(t.id)),'SOURCE_LINKS_REQUIRE_UNLINK');
      const planned=new Map(order.tasks.map(t=>[t.id,t]));
      order.tasks = action.tasks.map(t => {const old=planned.get(t.id);return { ...t,...(old?{planStart:old.planStart,planEnd:old.planEnd,estimatedHours:old.estimatedHours,scheduleTag:old.scheduleTag,customValues:old.customValues,sourceLinks:old.sourceLinks}:{}), status: 'open', assignee: null, percent: 0, reworkCount: 0,
        startedAt: null, submittedAt: null, acceptedAt: null, assetIds: [], quality: null };});
      break;
    }
    case 'publish': state('approved'); permit('dispatch'); need(order.tasks.length, 'TASKS_REQUIRED'); order.status = 'active'; break;
    case 'link-source': case 'unlink-source': {
      state('approved','active');const t=order.tasks.find(t=>t.id===action.taskId);need(t,'TASK_NOT_FOUND',404);
      need(!['review','accepted'].includes(t.status),'SOURCE_LINKS_FROZEN');need(!t.pendingHandover,'HANDOVER_PENDING');
      if(!has(actor,'dispatch')){permit('execute');need(t.assignee===actor.subject&&actor.workKinds.includes(t.kind)&&['claimed','in_progress','blocked','rework'].includes(t.status),'FORBIDDEN',403);}
      const links=t.sourceLinks??[],key=sourceKey(action.ref),existing=links.find(l=>sourceKey(l.ref)===key);
      if(action.type==='link-source'){need(!existing,'SOURCE_ALREADY_LINKED');need(links.length<30,'SOURCE_LINK_LIMIT');t.sourceLinks=[...links,{ref:action.ref,linkedBy:actor.subject,linkedAt:at,reason:action.reason}];}
      else{need(existing,'SOURCE_LINK_NOT_FOUND',404);eventData={removed:existing};t.sourceLinks=links.filter(l=>sourceKey(l.ref)!==key);}break;
    }
    case 'batch-tasks': {
      permit('dispatch');need(new Set(action.taskIds).size===action.taskIds.length,'DUPLICATE_TASK');
      let draft=order;
      for(const taskId of action.taskIds){draft=evolve(draft,actor,{...command,expectedVersion:draft.version,action:action.operation.type==='set-task-tag'?{...action.operation,taskId,reason:action.reason}:{...action.operation,taskId}},at).order;}
      eventData={before:order.tasks.filter(t=>action.taskIds.includes(t.id)).map(t=>({taskId:t.id,assignee:t.assignee,status:t.status,scheduleTag:t.scheduleTag??''}))};
      order.tasks=draft.tasks;break;
    }
    case 'set-task-tag': {
      state('approved','active');permit('dispatch');const t=order.tasks.find(t=>t.id===action.taskId);need(t,'TASK_NOT_FOUND',404);need(t.status!=='accepted','ACCEPTED_PLAN_IMMUTABLE');eventData={before:{scheduleTag:t.scheduleTag??''}};t.scheduleTag=action.scheduleTag;break;
    }
    case 'move-task-plan': {
      state('approved','active');permit('dispatch');const t=order.tasks.find(t=>t.id===action.taskId);need(t,'TASK_NOT_FOUND',404);need(t.status!=='accepted','ACCEPTED_PLAN_IMMUTABLE');need(!t.pendingHandover,'HANDOVER_PENDING');need(t.planStart&&t.planEnd&&t.estimatedHours,'PLAN_REQUIRED');need(t.planStart!==action.targetStart,'PLAN_MOVE_NO_CHANGE');
      const proposed=moveDates(t.planStart,t.planEnd,action.targetStart);eventData={before:{planStart:t.planStart,planEnd:t.planEnd},after:proposed};Object.assign(t,proposed);break;
    }
    case 'set-task-plan': {
      state('approved','active');permit('dispatch');const t=order.tasks.find(t=>t.id===action.taskId);need(t,'TASK_NOT_FOUND',404);need(t.status!=='accepted','ACCEPTED_PLAN_IMMUTABLE');
      const empty=action.planStart===null&&action.planEnd===null&&action.estimatedHours===null;
      need(empty||action.planStart!==null&&action.planEnd!==null&&action.estimatedHours!==null&&action.planEnd>=action.planStart&&(Date.parse(action.planEnd)-Date.parse(action.planStart))/86400000<366,'INVALID_PLAN_RANGE');
      eventData={before:{planStart:t.planStart??null,planEnd:t.planEnd??null,estimatedHours:t.estimatedHours??null,scheduleTag:t.scheduleTag??'',customValues:t.customValues??{}}};
      Object.assign(t,{planStart:action.planStart,planEnd:action.planEnd,estimatedHours:action.estimatedHours,scheduleTag:action.scheduleTag,customValues:{...t.customValues,...action.customValues}});break;
    }
    case 'cancel': state('draft', 'submitted', 'approved', 'active'); permit('manage'); order.status = 'cancelled'; break;
    case 'archive': state('completed', 'cancelled'); permit('manage'); order.status = 'archived'; break;
    default: {
      state('active');
      const task = order.tasks.find(t => t.id === action.taskId);
      need(task, 'TASK_NOT_FOUND', 404);
      const taskState = (...s: typeof task.status[]) => need(s.includes(task.status), 'INVALID_TASK_STATE');
      const executor = () => { permit('execute'); need(task.assignee === actor.subject && actor.workKinds.includes(task.kind), 'FORBIDDEN', 403); };
      const dependencies = () => need(task.dependencyIds.every(d => order.tasks.find(t => t.id === d)?.status === 'accepted'), 'DEPENDENCY_NOT_ACCEPTED');
      if(task.pendingHandover&&!['accept-handover','decline-handover','cancel-handover'].includes(action.type))throw new WorkflowError(409,'HANDOVER_PENDING');
      switch (action.type) {
        case 'propose-handover':
          taskState('in_progress','blocked','rework');permit('dispatch');need(task.assignee&&task.assignee!==action.assignee,'INVALID_HANDOVER_TARGET');
          need(!(task.handoverHistory??[]).some(h=>h.id===action.handoverId),'HANDOVER_ID_REUSED');
          need((task.handoverHistory?.length??0)<100,'HANDOVER_HISTORY_LIMIT');
          task.pendingHandover={id:action.handoverId,from:task.assignee,to:action.assignee,reason:action.reason,requestedBy:actor.subject,requestedAt:at};break;
        case 'accept-handover': case 'decline-handover': case 'cancel-handover': {
          const h=task.pendingHandover;need(h&&h.id===action.handoverId,'HANDOVER_CHANGED');
          if(action.type==='cancel-handover')permit('dispatch');else{permit('execute');need(h.to===actor.subject&&actor.workKinds.includes(task.kind),'FORBIDDEN',403);}
          if(action.type==='accept-handover')task.assignee=h.to;
          const record={...h,outcome:action.type==='accept-handover'?'accepted' as const:action.type==='decline-handover'?'declined' as const:'cancelled' as const,resolvedBy:actor.subject,resolvedAt:at,resolutionReason:action.type==='accept-handover'?'':action.reason};
          task.handoverHistory=[...(task.handoverHistory??[]),record];task.pendingHandover=null;eventData={handover:record};break;
        }
        case 'assign': taskState('open'); permit('dispatch'); task.assignee = action.assignee; task.status = 'assigned'; break;
        case 'claim':
          taskState('open', 'assigned'); permit('execute');
          need(actor.workKinds.includes(task.kind) && (!task.assignee || task.assignee === actor.subject), 'FORBIDDEN', 403);
          dependencies(); task.assignee = actor.subject; task.status = 'claimed'; break;
        case 'release':
          taskState('assigned', 'claimed');
          if (!has(actor, 'dispatch')) executor();
          task.assignee = null; task.status = 'open'; break;
        case 'start': taskState('claimed', 'rework'); executor(); dependencies(); task.status = 'in_progress'; task.startedAt ??= at; break;
        case 'progress': taskState('in_progress'); executor(); need(action.percent >= task.percent, 'PROGRESS_REGRESSION'); task.percent = action.percent; break;
        case 'block': taskState('in_progress'); executor(); task.status = 'blocked'; break;
        case 'resume': taskState('blocked'); executor(); task.status = 'in_progress'; break;
        case 'submit-delivery':
          taskState('in_progress'); executor(); task.assetIds = [...new Set(action.assetIds)];
          task.submittedAt = at; task.status = 'review'; break;
        case 'request-rework':
          taskState('review'); permit('review'); need(!participants(task).includes(actor.subject), 'SELF_REVIEW_FORBIDDEN', 403);
          task.reworkCount++; task.status = 'rework'; task.percent = 0; break;
        case 'accept-delivery':
          taskState('review'); permit('review'); need(!participants(task).includes(actor.subject), 'SELF_REVIEW_FORBIDDEN', 403);
          task.status = 'accepted'; task.percent = 100; task.acceptedAt = at; task.quality = action.quality;
          // Immutable measurement facts, NOT a final personnel score or payroll instruction.
          eventData = { taskId: task.id, taskTitle: task.title, orderTitle: order.title, contributor: task.assignee, contributionBps: (task.handoverHistory??[]).some(h=>h.outcome==='accepted')?null:10000, attributionStatus:(task.handoverHistory??[]).some(h=>h.outcome==='accepted')?'needs-review':'single-contributor', participants:participants(task), handoverHistory:task.handoverHistory??[], points: task.points,
            quality: task.quality, dueAt: task.dueAt, submittedAt: task.submittedAt, acceptedAt: at,
            reworkCount: task.reworkCount, assetIds: task.assetIds, measurementVersion: 2 };
          if (order.tasks.every(t => t.status === 'accepted')) order.status = 'completed';
          break;
      }
    }
  }
  order.version++; order.updatedAt = at;
  return { order, event: makeEvent(order, actor, command, at, eventData) };
}
function makeEvent(order: WorkOrder, actor: Actor, command: Command, at: string, data: Record<string, unknown> = {}): WorkflowEvent {
  return { id: createHash('sha256').update(`${order.enterpriseId}:${command.commandId}`).digest('hex'), schemaVersion: 1,
    ...(order.teamId ? { teamId: order.teamId } : {}),
    enterpriseId: order.enterpriseId, orderId: order.id, aggregateVersion: order.version, actor: actor.subject,
    type: command.action.type === 'accept-delivery' ? 'workflow.task.accepted.v1' : `workflow.${command.action.type}.v1`,
    occurredAt: at, data: { action: command.action, ...data } };
}
