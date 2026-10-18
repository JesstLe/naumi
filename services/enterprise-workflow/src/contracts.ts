import { z } from 'zod';
import {changeActions,type ChangeRequest,type Commitment} from './change-contracts';
import {guidelineSelection,type GuidelineSnapshot} from './guideline-contracts';
import {formSelection,type FormSnapshot} from './form-contracts';
import {catalogSelection,type CatalogSnapshot} from './catalog-contracts';

export const id = z.string().uuid();
const text = z.string().trim().min(1).max(2000);
const kind = z.enum(['design', 'artwork']);
export const calendarDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s+'T00:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===s;});
export const permission = z.enum(['request', 'dispatch', 'execute', 'review', 'manage']);
export type Permission = z.infer<typeof permission>;
export type Principal = { enterpriseId: string; subject: string; teamId?: string; sourceBinding?:{sourceInstance:string;sourceEnterprise:string;sourceSubject:string} };
// Resolved by a live server-side identity adapter, never accepted from browser JSON.
export type Actor = Principal & { permissions: Permission[]; workKinds: WorkKind[] };
export type WorkKind = z.infer<typeof kind>;
const taskId = { taskId: id };
const taskSpec = z.strictObject({
  id, title: text, kind, points: z.number().int().min(1).max(100),
  dueAt: z.string().datetime({ offset: true }), dependencyIds: z.array(id).max(50),
});
const assignee=z.string().trim().min(1).max(254);
const tag=z.string().regex(/^$|^[a-z][a-z0-9_]{0,63}$/);
const batchOperation=z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('assign'),assignee}),
 z.strictObject({type:z.literal('set-task-tag'),scheduleTag:tag}),
]);
export const batchPreviewSchema=z.strictObject({batchId:id,items:z.array(z.strictObject({orderId:id,taskId:id,expectedVersion:z.number().int().positive()})).min(1).max(50),operation:batchOperation,reason:text});
export const sourceRefSchema=z.strictObject({instanceId:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/),enterpriseId:id,kind:z.enum(['artwork','image-job','canvas-task','video-task','ledger']),id:z.string().trim().min(1).max(200)});
export type SourceRef=z.infer<typeof sourceRefSchema>;
export type SourceLink={ref:SourceRef;linkedBy:string;linkedAt:string;reason:string};
export const routingFieldsSchema=z.strictObject({brand:z.string().trim().max(80),shop:z.string().trim().max(80),businessUnit:z.string().trim().max(80),workKind:z.enum(['','design','artwork'])});
export type RoutingFields=z.infer<typeof routingFieldsSchema>;
export const actionSchema = z.discriminatedUnion('type', [
  ...changeActions,
  z.strictObject({type:z.literal('set-demand-assets'),assetIds:z.array(id.transform(s=>s.toLowerCase())).max(20),reason:text}),
  z.strictObject({type:z.literal('set-demand-guideline'),selection:guidelineSelection.nullable(),reason:text}),
  z.strictObject({type:z.literal('set-demand-form'),selection:formSelection.nullable(),reason:text}),
  z.strictObject({type:z.literal('set-demand-catalog'),selection:catalogSelection.nullable(),reason:text}),
  z.strictObject({ type: z.literal('create'), title: text, brief: text, acceptance: text,routingFields:routingFieldsSchema.optional() }),
  z.strictObject({ type: z.literal('revise-requirement'), title: text, brief: text, acceptance: text,routingFields:routingFieldsSchema.optional() }),
  z.strictObject({ type: z.literal('submit-requirement') }),
  z.strictObject({ type: z.literal('return-requirement'), reason: text }),
  z.strictObject({ type: z.literal('approve-requirement') }),
  z.strictObject({ type: z.literal('plan-tasks'), tasks: z.array(taskSpec).min(1).max(50) }),
  z.strictObject({ type: z.literal('publish') }),
  z.strictObject({type:z.literal('operations-signoff'),reason:text}),
  z.strictObject({type:z.literal('operations-followup'),followupId:id,title:text,brief:text,acceptance:text,reason:text}),
  z.strictObject({type:z.literal('link-source'),...taskId,ref:sourceRefSchema,reason:text}),
  z.strictObject({type:z.literal('unlink-source'),...taskId,ref:sourceRefSchema,reason:text}),
  z.strictObject({type:z.literal('move-task-plan'),...taskId,targetStart:calendarDate,reason:text,previewHash:z.string().regex(/^[a-f0-9]{64}$/),acknowledged:z.literal(true)}),
  z.strictObject({type:z.literal('set-task-plan'),...taskId,planStart:calendarDate.nullable(),planEnd:calendarDate.nullable(),estimatedHours:z.number().positive().max(1000).nullable(),scheduleTag:z.string().regex(/^$|^[a-z][a-z0-9_]{0,63}$/),customValues:z.record(z.string().regex(/^custom_[a-zA-Z0-9_]{1,56}$/),z.union([z.string().max(2000),z.number().finite(),z.null()])).refine(v=>Object.keys(v).length<=20),reason:text}),
  z.strictObject({ type: z.literal('assign'), ...taskId, assignee: z.string().trim().min(1).max(254) }),
  z.strictObject({ type: z.literal('claim'), ...taskId }),
  z.strictObject({type:z.literal('propose-handover'),...taskId,handoverId:id,assignee,reason:text}),
  z.strictObject({type:z.literal('accept-handover'),...taskId,handoverId:id}),
  z.strictObject({type:z.literal('decline-handover'),...taskId,handoverId:id,reason:text}),
  z.strictObject({type:z.literal('cancel-handover'),...taskId,handoverId:id,reason:text}),
  z.strictObject({type:z.literal('set-task-tag'),...taskId,scheduleTag:tag,reason:text}),
  z.strictObject({type:z.literal('batch-tasks'),batchId:id,taskIds:z.array(id).min(1).max(50),operation:batchOperation,reason:text}),
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
export type Handover = {id:string;from:string;to:string;reason:string;requestedBy:string;requestedAt:string};
export type HandoverRecord = Handover & {outcome:'accepted'|'declined'|'cancelled';resolvedBy:string;resolvedAt:string;resolutionReason:string};
export type Task = {
  commitmentBaseline?:Commitment;
  sourceLinks?:SourceLink[];
  pendingHandover?:Handover|null;handoverHistory?:HandoverRecord[];
  planStart?:string|null;planEnd?:string|null;estimatedHours?:number|null;scheduleTag?:string;customValues?:Record<string,string|number|null>;
  id: string; title: string; kind: WorkKind; points: number; dueAt: string; dependencyIds: string[];
  status: 'open' | 'assigned' | 'claimed' | 'in_progress' | 'blocked' | 'review' | 'rework' | 'accepted';
  assignee: string | null; percent: number; reworkCount: number; startedAt: string | null;
  submittedAt: string | null; acceptedAt: string | null; assetIds: string[]; quality: number | null;
};
export type WorkOrder = {
  changes?:ChangeRequest[];
  requirementBaseline?:{title:string;brief:string;acceptance:string;firstChangeId:string};
    guideline?:GuidelineSnapshot|null;
  demandAssets?:{id:string;orderId:string;uploader:string;name:string;bytes:number;sha256:string;revision:number;createdAt:string}[];
  creationOrigin?:{batchId:string;orderId?:string;version?:number};
  form?:FormSnapshot|null;
  catalog?:CatalogSnapshot|null;
  requestTeamId?:string;routingFields?:RoutingFields;
  routing?:{status:'assigned'|'unmatched'|'conflict'|'unavailable';ruleVersion:number;ruleIds:string[];fromTeamId:string;toTeamId:string|null;decidedBy:string;at:string;reason:string};
  operations?:{status:'signed'|'followup';actor:string;at:string;reason:string;followupId?:string;assetIds:string[]};
  followsOrderId?:string;
  teamId?: string;
  id: string; enterpriseId: string; requester: string; title: string; brief: string; acceptance: string;
  status: 'draft' | 'submitted' | 'approved' | 'active' | 'completed' | 'cancelled' | 'archived';
  version: number; createdAt: string; updatedAt: string; tasks: Task[];
};
export type WorkflowEvent = {
  teamId?: string;
  id: string; schemaVersion: 1; enterpriseId: string; orderId: string; aggregateVersion: number;
  actor: string; type: string; occurredAt: string; data: Record<string, unknown>;
};
export class WorkflowError extends Error {
  constructor(public status: number, public code: string, message = code) { super(message); }
}
