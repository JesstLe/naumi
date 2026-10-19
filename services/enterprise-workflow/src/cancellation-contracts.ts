import {z} from 'zod';
import type {ChangeApproval} from './change-contracts';
const id=z.string().uuid().transform(s=>s.toLowerCase()),reason=z.string().trim().min(1).max(2000),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const cancellationActions=[
 z.strictObject({type:z.literal('request-cancellation'),cancellationId:id,category:z.enum(['business-change','duplicate','budget','invalid-request','other']),reason,impactHash:hash}),
 z.strictObject({type:z.literal('approve-cancellation'),cancellationId:id,side:z.enum(['business','execution']),reason}),
 z.strictObject({type:z.literal('reject-cancellation'),cancellationId:id,reason}),
 z.strictObject({type:z.literal('withdraw-cancellation'),cancellationId:id,reason}),
 z.strictObject({type:z.literal('apply-cancellation'),cancellationId:id,reason,acknowledgedRetainedFacts:z.literal(true),acknowledgedExternalFollowup:z.literal(true)}),
]as const;
export const cancellationPreview=z.strictObject({orderId:id,expectedVersion:z.number().int().positive()});
export type CancellationAction=z.infer<(typeof cancellationActions)[number]>;
export type CancellationImpact={hash:string;tasks:{id:string;title:string;status:string;assignee:string|null;points:number;percent:number}[];acceptedTaskIds:string[];unfinishedTaskIds:string[];pendingHandovers:string[];pendingChanges:string[];deliveryFiles:number;deliveryBytes:number;openUploadSessions:number;policy:'retain-facts-files-project-links-and-channel-states';externalScope:'current-viewer-only-not-persisted'};
export type CancellationRequest={id:string;category:'business-change'|'duplicate'|'budget'|'invalid-request'|'other';status:'proposed'|'approved'|'rejected'|'withdrawn'|'applied';proposedBy:string;proposedAt:string;reason:string;baselineVersion:number;impact:CancellationImpact;approvals:ChangeApproval[];resolution?:{actor:string;at:string;reason:string;version:number}};
