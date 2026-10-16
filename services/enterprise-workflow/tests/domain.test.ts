import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { commandSchema, WorkflowError, type Actor, type Action, type WorkOrder } from '../src/contracts';
import { evolve, canRead } from '../src/domain';

const enterpriseId = randomUUID(), orderId = randomUUID(), taskId = randomUUID(), artId = randomUUID();
const at = '2026-10-16T00:00:00.000Z';
const actor = (subject: string, permissions: Actor['permissions'], workKinds: Actor['workKinds'] = []): Actor => ({ enterpriseId, subject, permissions, workKinds });
const operator = actor('operations', ['request']);
const lead = actor('lead', ['dispatch', 'manage']);
const designer = actor('designer', ['execute'], ['design']);
const artist = actor('artist', ['execute'], ['artwork']);
const reviewer = actor('reviewer', ['review']);
const spec = (id = taskId, dependencyIds: string[] = []) => ({ id, title: '活动主视觉', kind: 'design' as const, points: 8, dueAt: '2026-10-20T00:00:00.000Z', dependencyIds });
function apply(order: WorkOrder | null, who: Actor, action: Action) {
  return evolve(order, who, commandSchema.parse({ commandId: randomUUID(), orderId, expectedVersion: order?.version ?? 0, action }), at);
}
function approved() {
  let order = apply(null, operator, { type: 'create', title: '秋季活动', brief: '主图和详情页', acceptance: '指定尺寸与卖点完整' }).order;
  order = apply(order, operator, { type: 'submit-requirement' }).order;
  return apply(order, lead, { type: 'approve-requirement' }).order;
}
function active() {
  let order = apply(approved(), lead, { type: 'plan-tasks', tasks: [spec()] }).order;
  return apply(order, lead, { type: 'publish' }).order;
}
function code(run: () => unknown, expected: string) {
  assert.throws(run, e => e instanceof WorkflowError && e.code === expected);
}
test('requirement return, revise and resubmit retain original immutable state', () => {
  const original = approved();
  code(() => apply(original, operator, { type: 'revise-requirement', title: 'x', brief: 'x', acceptance: 'x' }), 'INVALID_ORDER_STATE');
  let draft = apply(null, operator, { type: 'create', title: 'a', brief: 'b', acceptance: 'c' }).order;
  draft = apply(draft, operator, { type: 'submit-requirement' }).order;
  draft = apply(draft, lead, { type: 'return-requirement', reason: '补充尺寸' }).order;
  const revised = apply(draft, operator, { type: 'revise-requirement', title: '主图', brief: '1200宽', acceptance: '无裁切' }).order;
  assert.equal(draft.title, 'a'); assert.equal(revised.title, '主图');
  code(() => apply(draft, { ...operator, permissions: [] }, { type: 'submit-requirement' }), 'FORBIDDEN');
});
test('full requirement → claim → block/resume → rework → acceptance → archive', () => {
  let order = active();
  order = apply(order, designer, { type: 'claim', taskId }).order;
  order = apply(order, designer, { type: 'start', taskId }).order;
  order = apply(order, designer, { type: 'progress', taskId, percent: 60, note: '完成排版' }).order;
  code(() => apply(order, designer, { type: 'progress', taskId, percent: 10, note: '回退' }), 'PROGRESS_REGRESSION');
  order = apply(order, designer, { type: 'block', taskId, reason: '等待产品图' }).order;
  order = apply(order, designer, { type: 'resume', taskId }).order;
  order = apply(order, designer, { type: 'submit-delivery', taskId, assetIds: [artId], note: '第一稿' }).order;
  order = apply(order, reviewer, { type: 'request-rework', taskId, reason: '调整对比度' }).order;
  order = apply(order, designer, { type: 'start', taskId }).order;
  order = apply(order, designer, { type: 'submit-delivery', taskId, assetIds: [randomUUID()], note: '第二稿' }).order;
  const result = apply(order, reviewer, { type: 'accept-delivery', taskId, quality: 4, note: '验收通过' });
  assert.equal(result.order.status, 'completed'); assert.equal(result.order.tasks[0].percent, 100);
  assert.equal(result.event.type, 'workflow.task.accepted.v1'); assert.equal(result.event.data.reworkCount, 1);
  assert.equal(result.event.data.points, 8); assert.equal(result.event.data.contributionBps, 10000);
  order = apply(result.order, lead, { type: 'archive' }).order;
  assert.equal(order.status, 'archived');
});
test('assignment requires named executor acknowledgement; cannot steal task', () => {
  let order = apply(active(), lead, { type: 'assign', taskId, assignee: designer.subject }).order;
  code(() => apply(order, designer, { type: 'start', taskId }), 'INVALID_TASK_STATE');
  code(() => apply(order, actor('other', ['execute'], ['design']), { type: 'claim', taskId }), 'FORBIDDEN');
  order = apply(order, designer, { type: 'claim', taskId }).order;
  order = apply(order, designer, { type: 'release', taskId, reason: '尚未开工，交回池' }).order;
  assert.equal(order.tasks[0].status, 'open'); assert.equal(order.tasks[0].assignee, null);
});
test('role, tenant, immutable version and self-review boundaries', () => {
  let order = active();
  assert.equal(canRead({ ...designer, enterpriseId: randomUUID() }, order), false);
  code(() => apply(order, { ...lead, enterpriseId: randomUUID() }, { type: 'cancel', reason: 'x' }), 'NOT_FOUND');
  code(() => apply(order, artist, { type: 'claim', taskId }), 'FORBIDDEN');
  assert.throws(() => evolve(order, lead, { commandId: randomUUID(), orderId, expectedVersion: 0, action: { type: 'cancel', reason: 'x' } }, at), /VERSION_CONFLICT/);
  order = apply(order, designer, { type: 'claim', taskId }).order;
  order = apply(order, designer, { type: 'start', taskId }).order;
  order = apply(order, designer, { type: 'submit-delivery', taskId, assetIds: [artId], note: '稿' }).order;
  code(() => apply(order, { ...designer, permissions: ['execute', 'review'] }, { type: 'accept-delivery', taskId, quality: 5, note: '自评' }), 'SELF_REVIEW_FORBIDDEN');
});
test('dependencies reject cycles; successor cannot claim before predecessor accepted', () => {
  const child = randomUUID();
  code(() => apply(approved(), lead, { type: 'plan-tasks', tasks: [spec(taskId, [child]), spec(child, [taskId])] }), 'CYCLIC_DEPENDENCY');
  code(() => apply(approved(), lead, { type: 'plan-tasks', tasks: [spec(taskId, [randomUUID()])] }), 'INVALID_DEPENDENCY');
  code(() => apply(approved(), lead, { type: 'plan-tasks', tasks: [spec(), spec()] }), 'DUPLICATE_TASK');
  const planned = apply(approved(), lead, { type: 'plan-tasks', tasks: [spec(), spec(child, [taskId])] }).order;
  const order = apply(planned, lead, { type: 'publish' }).order;
  code(() => apply(order, designer, { type: 'claim', taskId: child }), 'DEPENDENCY_NOT_ACCEPTED');
});
test('cancel does not produce acceptance facts, terminal states reject execution', () => {
  const result = apply(active(), lead, { type: 'cancel', reason: '活动取消' });
  assert.equal(result.event.type, 'workflow.cancel.v1'); assert.equal(result.event.data.points, undefined);
  code(() => apply(result.order, designer, { type: 'claim', taskId }), 'FORBIDDEN');
  code(() => apply(result.order, lead, { type: 'publish' }), 'INVALID_ORDER_STATE');
});
test('strict commands reject role injection, blank reasons and over-100 progress', () => {
  const base = { commandId: randomUUID(), orderId, expectedVersion: 0, action: { type: 'claim', taskId } };
  assert.equal(commandSchema.safeParse({ ...base, permissions: ['manage'] }).success, false);
  assert.equal(commandSchema.safeParse({ ...base, action: { type: 'cancel', reason: ' ' } }).success, false);
  assert.equal(commandSchema.safeParse({ ...base, action: { type: 'progress', taskId, percent: 100, note: 'x' } }).success, false);
});
