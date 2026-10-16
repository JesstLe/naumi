import { z } from 'zod';

export const id = z.string().uuid();
const text = z.string().trim().min(1).max(2000);
const kind = z.enum(['design', 'artwork']);
export const permission = z.enum(['request', 'dispatch', 'execute', 'review', 'manage']);
export type Permission = z.infer<typeof permission>;
export type Principal = { enterpriseId: string; subject: string };
// Resolved by a live server-side identity adapter, never accepted from browser JSON.
export type Actor = Principal & { permissions: Permission[]; workKinds: WorkKind[] };
export type WorkKind = z.infer<typeof kind>;
const taskId = { taskId: id };
const taskSpec = z.strictObject({
  id, title: text, kind, points: z.number().int().min(1).max(100),
  dueAt: z.string().datetime({ offset: true }), dependencyIds: z.array(id).max(50),
});
export const actionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('create'), title: text, brief: text, acceptance: text }),
  z.strictObject({ type: z.literal('revise-requirement'), title: text, brief: text, acceptance: text }),
  z.strictObject({ type: z.literal('submit-requirement') }),
  z.strictObject({ type: z.literal('return-requirement'), reason: text }),
  z.strictObject({ type: z.literal('approve-requirement') }),
  z.strictObject({ type: z.literal('plan-tasks'), tasks: z.array(taskSpec).min(1).max(50) }),
  z.strictObject({ type: z.literal('publish') }),
  z.strictObject({ type: z.literal('assign'), ...taskId, assignee: z.string().trim().min(1).max(254) }),
  z.strictObject({ type: z.literal('claim'), ...taskId }),
  z.strictObject({ type: z.literal('release'), ...taskId, reason: text }),
  z.strictObject({ type: z.literal('start'), ...taskId }),
  z.strictObject({ type: z.literal('progress'), ...taskId, percent: z.number().int().min(0).max(99), note: text }),
  z.strictObject({ type: z.literal('block'), ...taskId, reason: text }),
  z.strictObject({ type: z.literal('resume'), ...taskId }),
  z.strictObject({ type: z.literal('submit-delivery'), ...taskId, assetIds: z.array(id).min(1).max(30), note: text }),
  z.strictObject({ type: z.literal('request-rework'), ...taskId, reason: text }),
  z.strictObject({ type: z.literal('accept-delivery'), ...taskId, quality: z.number().int().min(1).max(5), note: text }),
  z.strictObject({ type: z.literal('cancel'), reason: text }),
  z.strictObject({ type: z.literal('archive') }),
]);
export const commandSchema = z.strictObject({
  commandId: id, orderId: id, expectedVersion: z.number().int().nonnegative(), action: actionSchema,
});
export type Action = z.infer<typeof actionSchema>;
export type Command = z.infer<typeof commandSchema>;
export type Task = {
  id: string; title: string; kind: WorkKind; points: number; dueAt: string; dependencyIds: string[];
  status: 'open' | 'assigned' | 'claimed' | 'in_progress' | 'blocked' | 'review' | 'rework' | 'accepted';
  assignee: string | null; percent: number; reworkCount: number; startedAt: string | null;
  submittedAt: string | null; acceptedAt: string | null; assetIds: string[]; quality: number | null;
};
export type WorkOrder = {
  id: string; enterpriseId: string; requester: string; title: string; brief: string; acceptance: string;
  status: 'draft' | 'submitted' | 'approved' | 'active' | 'completed' | 'cancelled' | 'archived';
  version: number; createdAt: string; updatedAt: string; tasks: Task[];
};
export type WorkflowEvent = {
  id: string; schemaVersion: 1; enterpriseId: string; orderId: string; aggregateVersion: number;
  actor: string; type: string; occurredAt: string; data: Record<string, unknown>;
};
export class WorkflowError extends Error {
  constructor(public status: number, public code: string, message = code) { super(message); }
}
