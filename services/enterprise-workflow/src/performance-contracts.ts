import {z} from 'zod';
import {id,calendarDate} from './contracts';
export const factId=z.string().regex(/^[a-f0-9]{64}$/);
export const sharesSchema=z.array(z.strictObject({subject:z.string().min(1).max(254),bps:z.number().int().min(0).max(10000)})).min(1).max(101).refine(v=>new Set(v.map(x=>x.subject)).size===v.length&&v.reduce((n,x)=>n+x.bps,0)===10000);
export const ruleSchema=z.strictObject({title:z.string().trim().min(1).max(80),qualityBps:z.array(z.number().int().min(0).max(20000)).length(5),lateBps:z.number().int().min(0).max(10000),reworkPenaltyBps:z.number().int().min(0).max(5000),maxReworkPenaltyBps:z.number().int().min(0).max(10000)});
export const performanceCommandSchema=z.strictObject({commandId:id,expectedVersion:z.number().int().nonnegative(),reason:z.string().trim().min(1).max(2000),action:z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('propose-allocation'),factId,shares:sharesSchema}),
 z.strictObject({type:z.literal('review-allocation'),factId,approve:z.boolean()}),
 z.strictObject({type:z.literal('save-rule'),rule:ruleSchema}),
 z.strictObject({type:z.literal('publish-rule')}),
 z.strictObject({type:z.literal('create-period'),periodId:id,title:z.string().trim().min(1).max(80),from:calendarDate,to:calendarDate,ruleVersion:z.number().int().positive()}),
 z.strictObject({type:z.literal('discard-period'),periodId:id}),
 z.strictObject({type:z.literal('confirm-period'),periodId:id,previewHash:z.string().regex(/^[a-f0-9]{64}$/)}),
])});
export const performanceQuerySchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('rules')}),z.strictObject({action:z.literal('allocations'),ids:z.string().max(1949).refine(v=>v.split(',').length<=30&&v.split(',').every(id=>/^[a-f0-9]{64}$/.test(id)))}),z.strictObject({action:z.literal('allocation'),factId}),
 z.strictObject({action:z.literal('periods'),page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('period'),id}),z.strictObject({action:z.literal('preview'),id}),
 z.strictObject({action:z.literal('audit'),before:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(Number.MAX_SAFE_INTEGER)}),
]);
export type Shares=z.infer<typeof sharesSchema>;export type Rule=z.infer<typeof ruleSchema>;
export type Allocation={factId:string;version:number;status:'proposed'|'approved'|'rejected';shares:Shares;proposedBy:string;proposedAt:string;reason:string;reviewedBy?:string;reviewedAt?:string;reviewReason?:string};
export type PublishedRule={version:number;rule:Rule;authoredBy:string;publishedBy:string;publishedAt:string;reason:string};
export type RuleDraft={version:number;status:'draft'|'published';rule:Rule;authoredBy:string;updatedAt:string;publishedVersion?:number};
export type AcceptedFact={committedDueAt?:string;originalPoints?:number;changeIds?:string[];id:string;orderId:string;taskId:string;taskTitle:string;orderTitle:string;actor:string;occurredAt:string;points:number;quality:number;dueAt:string;submittedAt:string;acceptedAt:string;reworkCount:number;contributor:string;contributionBps:number|null;participants:string[]};
export type ScorePart={subject:string;bps:number;baseMilli:number;scoreMilli:number};
export type ScoreRow={fact:AcceptedFact;allocationVersion:number;allocationApprovedBy:string|null;shares:Shares;onTime:boolean;reworkBps:number;scoreMilli:number;baseMilli:number;parts:ScorePart[]};
export type ScoreResult={subject:string;taskCount:number;onTimeCount:number;onTimeRateBps:number;reworkCount:number;baseMilli:number;scoreMilli:number};
export type Snapshot={rule:PublishedRule;rows:ScoreRow[];results:ScoreResult[];blocked:{factId:string;code:string}[];factCount:number;previewHash:string};
export type Period={id:string;version:number;title:string;from:string;to:string;ruleVersion:number;status:'draft'|'confirmed'|'discarded';createdBy:string;createdAt:string;confirmedBy?:string;confirmedAt?:string;snapshot?:Snapshot};
