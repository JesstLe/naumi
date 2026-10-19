import {z} from 'zod';
import type {ChangeApproval} from './change-contracts';
const id=z.string().uuid().transform(s=>s.toLowerCase()),reason=z.string().trim().min(1).max(2000),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const pauseActions=[
 z.strictObject({type:z.literal('request-pause'),pauseId:id,mode:z.enum(['pause','resume']),reason,impactHash:hash}),
 z.strictObject({type:z.literal('approve-pause'),pauseId:id,side:z.enum(['business','execution']),reason}),
 z.strictObject({type:z.literal('reject-pause'),pauseId:id,reason}),
 z.strictObject({type:z.literal('withdraw-pause'),pauseId:id,reason}),
 z.strictObject({type:z.literal('apply-pause'),pauseId:id,reason,acknowledgedRetainedFacts:z.literal(true),acknowledgedCurrentPlan:z.literal(true)}),
]as const;
export const pausePreview=z.strictObject({orderId:id,expectedVersion:z.number().int().positive()});
export type PauseAction=z.infer<(typeof pauseActions)[number]>;
export type PauseImpact={plans:{taskId:string;planStart:string|null;planEnd:string|null;estimatedHours:number|null;dueAt:string}[];capacityPolicy:'reserve-wip-and-planned-hours';hash:string;tasks:{id:string;title:string;status:string;assignee:string|null;points:number;percent:number}[];acceptedTaskIds:string[];unfinishedTaskIds:string[];pendingHandovers:string[];pendingChanges:string[];deliveryFiles:number;deliveryBytes:number;openUploadSessions:number;policy:'retain-facts-files-project-links-and-channel-states';externalScope:'current-viewer-only-not-persisted'};
export type PauseRequest={id:string;mode:'pause'|'resume';status:'proposed'|'approved'|'rejected'|'withdrawn'|'applied';proposedBy:string;proposedAt:string;reason:string;baselineVersion:number;impact:PauseImpact;approvals:ChangeApproval[];resolution?:{actor:string;at:string;reason:string;version:number}};
