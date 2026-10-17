import { createHash } from 'node:crypto';
import { WorkflowError, type Actor, type Command, type WorkOrder, type WorkflowEvent, type Permission } from './contracts';

function need(ok: unknown, code: string, status = 409): asserts ok {
  if (!ok) throw new WorkflowError(status, code);
}
export function has(actor: Actor, p: Permission) { return actor.permissions.includes(p); }
export function canRead(actor: Actor, order: WorkOrder) {
  if ((actor.teamId !== undefined || order.teamId !== undefined) && actor.teamId !== order.teamId) return false;
  return actor.enterpriseId === order.enterpriseId && (has(actor, 'manage') || has(actor, 'dispatch') || has(actor, 'review') ||
    order.requester === actor.subject || order.tasks.some(t => t.assignee === actor.subject) ||
    has(actor, 'execute') && order.status === 'active' && order.tasks.some(t => t.status === 'open' && actor.workKinds.includes(t.kind)));
}
export function evolve(previous: WorkOrder | null, actor: Actor, command: Command, at: string) {
  const action = command.action;
  const permit = (p: Permission) => need(has(actor, p), 'FORBIDDEN', 403);
  if (!previous) {
    need(action.type === 'create', 'NOT_FOUND', 404); permit('request');
    need(command.expectedVersion === 0, 'VERSION_CONFLICT');
    const order: WorkOrder = { id: command.orderId, enterpriseId: actor.enterpriseId, ...(actor.teamId ? { teamId: actor.teamId } : {}), requester: actor.subject,
      title: action.title, brief: action.brief, acceptance: action.acceptance, status: 'draft', version: 1,
      createdAt: at, updatedAt: at, tasks: [] };
    return { order, event: makeEvent(order, actor, command, at) };
  }
  need(previous.enterpriseId === actor.enterpriseId, 'NOT_FOUND', 404);
  need(previous.id === command.orderId, 'NOT_FOUND', 404);
  need(canRead(actor, previous), 'FORBIDDEN', 403);
  need(previous.version === command.expectedVersion, 'VERSION_CONFLICT');
  need(action.type !== 'create', 'ALREADY_EXISTS');
  const order = structuredClone(previous);
  const state = (...allowed: WorkOrder['status'][]) => need(allowed.includes(order.status), 'INVALID_ORDER_STATE');
  const owner = () => need(order.requester === actor.subject || has(actor, 'manage'), 'FORBIDDEN', 403);
  let eventData: Record<string, unknown> = {};
  switch (action.type) {
    case 'revise-requirement': state('draft'); permit('request'); owner(); order.title = action.title; order.brief = action.brief; order.acceptance = action.acceptance; break;
    case 'submit-requirement': state('draft'); permit('request'); owner(); order.status = 'submitted'; break;
    case 'return-requirement': state('submitted'); permit('dispatch'); order.status = 'draft'; break;
    case 'approve-requirement': state('submitted'); permit('dispatch'); order.status = 'approved'; break;
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
      order.tasks = action.tasks.map(t => ({ ...t, status: 'open', assignee: null, percent: 0, reworkCount: 0,
        startedAt: null, submittedAt: null, acceptedAt: null, assetIds: [], quality: null }));
      break;
    }
    case 'publish': state('approved'); permit('dispatch'); need(order.tasks.length, 'TASKS_REQUIRED'); order.status = 'active'; break;
    case 'cancel': state('draft', 'submitted', 'approved', 'active'); permit('manage'); order.status = 'cancelled'; break;
    case 'archive': state('completed', 'cancelled'); permit('manage'); order.status = 'archived'; break;
    default: {
      state('active');
      const task = order.tasks.find(t => t.id === action.taskId);
      need(task, 'TASK_NOT_FOUND', 404);
      const taskState = (...s: typeof task.status[]) => need(s.includes(task.status), 'INVALID_TASK_STATE');
      const executor = () => { permit('execute'); need(task.assignee === actor.subject && actor.workKinds.includes(task.kind), 'FORBIDDEN', 403); };
      const dependencies = () => need(task.dependencyIds.every(d => order.tasks.find(t => t.id === d)?.status === 'accepted'), 'DEPENDENCY_NOT_ACCEPTED');
      switch (action.type) {
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
          taskState('review'); permit('review'); need(task.assignee !== actor.subject, 'SELF_REVIEW_FORBIDDEN', 403);
          task.reworkCount++; task.status = 'rework'; task.percent = 0; break;
        case 'accept-delivery':
          taskState('review'); permit('review'); need(task.assignee !== actor.subject, 'SELF_REVIEW_FORBIDDEN', 403);
          task.status = 'accepted'; task.percent = 100; task.acceptedAt = at; task.quality = action.quality;
          // Immutable measurement facts, NOT a final personnel score or payroll instruction.
          eventData = { taskId: task.id, contributor: task.assignee, contributionBps: 10000, points: task.points,
            quality: task.quality, dueAt: task.dueAt, submittedAt: task.submittedAt, acceptedAt: at,
            reworkCount: task.reworkCount, assetIds: task.assetIds, measurementVersion: 1 };
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
