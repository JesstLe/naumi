import {z} from 'zod';
import type {Principal} from './contracts';
const id=z.string().uuid().transform(s=>s.toLowerCase()),text=z.string().trim().min(1).max(2000);
const fields={title:text.optional(),points:z.number().int().min(1).max(100).optional(),dueAt:z.string().datetime({offset:true}).optional()};
export const changePatch=z.strictObject({
 requirement:z.strictObject({title:text.optional(),brief:text.optional(),acceptance:text.optional()}).refine(v=>Object.keys(v).length>0).optional(),
 tasks:z.array(z.strictObject({taskId:id,...fields}).refine(v=>Object.keys(v).length>1)).max(50).default([]),
}).refine(v=>!!v.requirement||v.tasks.length>0).refine(v=>new Set(v.tasks.map(t=>t.taskId)).size===v.tasks.length);
export const changeActions=[
 z.strictObject({type:z.literal('propose-change'),changeId:id,reason:text,patch:changePatch}),
 z.strictObject({type:z.literal('approve-change'),changeId:id,side:z.enum(['business','execution']),reason:text}),
 z.strictObject({type:z.literal('reject-change'),changeId:id,reason:text}),
 z.strictObject({type:z.literal('withdraw-change'),changeId:id,reason:text}),
 z.strictObject({type:z.literal('apply-change'),changeId:id,reason:text}),
] as const;
export const changePreview=z.strictObject({orderId:id,expectedVersion:z.number().int().positive(),patch:changePatch});
export type ChangePatch=z.infer<typeof changePatch>;
export type ChangeAction=z.infer<(typeof changeActions)[number]>;
export type Commitment={title:string;points:number;dueAt:string;firstChangeId:string};
export type ChangeApproval={side:'business'|'execution';subject:string;teamId?:string;sourceBinding?:Principal['sourceBinding'];at:string;reason:string};
export type ChangeImpact={fields:{taskId:string|null;field:string;before:string|number;after:string|number}[];taskIds:string[];downstreamIds:string[];deltaPoints:number;warnings:{taskId:string;code:string}[];scheduleAutomaticallyChanged:false};
export type ChangeRequest={id:string;status:'proposed'|'approved'|'rejected'|'withdrawn'|'applied';proposedBy:string;proposedAt:string;reason:string;baselineVersion:number;baselineHash:string;patch:ChangePatch;impact:ChangeImpact;approvals:ChangeApproval[];resolution?:{actor:string;at:string;reason:string;version:number}};
