import { z } from 'zod';
import { id } from './contracts';

const key = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const label = z.string().trim().min(1).max(24);
const reason = z.string().trim().min(1).max(200);
const tint = z.enum(['white', 'blue', 'yellow', 'green', 'purple']);
export const systemColumns = ['title','image','assignee','owner','due','planStart','planEnd','estimatedHours','status','kind','quantity','brief','scheduleTag'];
export const layoutSchema = z.strictObject({
  columns: z.array(z.strictObject({ id: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,63}$/), label, width: z.number().int().min(100).max(420), visible: z.boolean(), tint })).min(13).max(33),
  group: z.enum(['none','assignee','owner']), density: z.enum(['compact','normal','relaxed']), summary: z.boolean(),
  layout: z.enum(['table','split']), renderer: z.enum(['table','board']), groupAnchor: z.enum(['parent','task']),
  board: z.strictObject({ groupField: z.literal('scheduleTag'), cardFields: z.array(z.enum(['due','planStart','status','kind','assignee','scheduleTag'])).max(6), showEmpty: z.boolean() }),
  filters: z.strictObject({ query: z.string().max(2000), assignee: z.string().max(254), status: z.string().max(80) }),
  rules: z.array(z.strictObject({ field: z.enum(['status','assignee','scheduleTag','kind']), operator: z.literal('eq'), value: z.string().max(80), tint })).max(10),
});
export type Layout = z.infer<typeof layoutSchema>;
export const fieldSchema = z.strictObject({ id: z.string().regex(/^custom_[a-zA-Z0-9_]{1,56}$/), label,
  type: z.enum(['text','number','date','select']), options: z.array(z.string().trim().min(1).max(20)).max(12), archived: z.boolean() });
export const optionSchema = z.strictObject({ id: key, label, color: z.enum(['blue','yellow','orange','green','purple']) });
const viewId = { viewId: key };
const action = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('initialize') }),
  z.strictObject({ type: z.literal('create-view'), ...viewId, name: label, copyFrom: key.optional() }),
  z.strictObject({ type: z.literal('rename-view'), ...viewId, name: label }),
  z.strictObject({ type: z.literal('archive-view'), ...viewId, archived: z.boolean() }),
  z.strictObject({ type: z.literal('reorder-views'), viewIds: z.array(key).min(1).max(20) }),
  z.strictObject({ type: z.literal('save-draft'), ...viewId, baseRevision: z.number().int().positive(), config: layoutSchema }),
  z.strictObject({ type: z.literal('discard-draft'), ...viewId }),
  z.strictObject({ type: z.literal('publish-view'), ...viewId, baseRevision: z.number().int().positive() }),
  z.strictObject({ type: z.literal('restore-view'), ...viewId, revision: z.number().int().positive() }),
  z.strictObject({ type: z.literal('set-fields'), fields: z.array(fieldSchema).max(20) }),
  z.strictObject({ type: z.literal('set-options'), options: z.array(optionSchema).min(1).max(20) }),
  z.strictObject({ type: z.literal('save-personal'), ...viewId, baseRevision: z.number().int().positive(), config: layoutSchema }),
  z.strictObject({ type: z.literal('reset-personal'), ...viewId }),
]);
export const schedulingCommandSchema = z.strictObject({ commandId: id, teamId: id,
  expectedVersion: z.number().int().nonnegative(), reason, action });
export type SchedulingCommand = z.infer<typeof schedulingCommandSchema>;
export type Field = z.infer<typeof fieldSchema>;
export type Option = z.infer<typeof optionSchema>;
export type Snapshot = { revision: number; config: Layout; actor: string; at: string; reason: string };
export type View = { id: string; name: string; archived: boolean; revision: number; published: Layout;
  draft: { baseRevision: number; config: Layout; actor: string; at: string } | null; history: Snapshot[] };
export type Workbook = { schema: 3; version: number; views: View[]; fields: Field[]; options: Option[] };

export function defaultLayout(): Layout {
  const labels = ['产品需求 / 制作任务','产品图','执行人','需求方','承诺交付','计划开始','计划结束','预计小时','任务状态','任务类型','交付数量','需求文档','任务排期情况'];
  return { columns: systemColumns.map((id, i) => ({ id, label: labels[i], width: i === 0 ? 310 : 140, visible: true, tint: 'white' })),
    group: 'none', density: 'normal', summary: true, layout: 'table', renderer: 'table', groupAnchor: 'parent',
    board: { groupField: 'scheduleTag', cardFields: ['due','status','kind'], showEmpty: true },
    filters: { query: '', assignee: 'all', status: 'all' }, rules: [] };
}
