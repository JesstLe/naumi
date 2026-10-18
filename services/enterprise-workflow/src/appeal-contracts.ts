import {z} from 'zod';
import {factId} from './performance-contracts';
const id=z.string().uuid().transform(s=>s.toLowerCase()),hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().trim().min(1).max(4000),reason=text.max(2000);
export const appealCommand=z.strictObject({commandId:id,id,expectedVersion:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),reason,action:z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('create'),periodId:id,factId,basisHash:hash,expectedOutcome:text,evidence:text,previousId:id.optional()}),
 z.strictObject({type:z.literal('supplement'),evidence:text}),z.strictObject({type:z.literal('withdraw')}),
 z.strictObject({type:z.literal('assign'),reviewer:z.string().trim().min(1).max(254),dueAt:z.string().datetime({offset:true}).nullable()}),
 z.strictObject({type:z.literal('resolve'),outcome:z.enum(['upheld','corrected']),basisHash:hash,correctionId:id.optional()})])});
export const appealQuery=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('basis'),periodId:id,factId}),
 z.strictObject({action:z.literal('list'),periodId:id,scope:z.enum(['mine','team']).default('mine'),state:z.enum(['all','submitted','in_review','resolved','withdrawn']).default('all'),page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('detail'),id}),z.strictObject({action:z.literal('history'),id,page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('reviewers'),id,page:z.coerce.number().int().min(1).max(10000).default(1)})]);
export type AppealBasis={periodId:string;periodTitle:string;factId:string;taskTitle:string;ruleVersion:number;subject:string;original:{bps:number;baseMilli:number;scoreMilli:number};current:{bps:number;baseMilli:number;scoreMilli:number};correctionId:string|null;correctionRevision:number;basisHash:string};
export type Appeal={id:string;enterpriseId:string;teamId:string;subject:string;periodId:string;factId:string;version:number;status:'submitted'|'in_review'|'resolved'|'withdrawn';reason:string;expectedOutcome:string;evidence:string;basis:AppealBasis;previousId?:string;createdAt:string;updatedAt:string;supplements:{by:string;at:string;evidence:string}[];reviewer:string|null;dueAt:string|null;resolution?:{by:string;at:string;reason:string;outcome:'upheld'|'corrected';basis:AppealBasis;correctionId?:string}};
