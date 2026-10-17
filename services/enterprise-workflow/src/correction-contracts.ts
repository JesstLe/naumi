import {z} from 'zod';
import {id} from './contracts';
import {factId,sharesSchema,type Shares,type ScorePart} from './performance-contracts';
export const correctionQuery=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('list'),periodId:id,state:z.enum(['all','proposed','approved','rejected','withdrawn']).default('all'),page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('detail'),id}),
 z.strictObject({action:z.literal('basis'),periodId:id,factId}),
 z.strictObject({action:z.literal('reconciliation'),periodId:id})]);
const reason=z.string().trim().min(1).max(2000),hash=z.string().regex(/^[a-f0-9]{64}$/),proposal={periodId:id,factId,baseRevision:z.number().int().nonnegative(),shares:sharesSchema,reason};
export const correctionPreview=z.strictObject({operation:z.literal('preview'),...proposal});
export const correctionCommand=z.discriminatedUnion('operation',[
 z.strictObject({operation:z.literal('propose'),commandId:id,id,...proposal,previewHash:hash}),
 z.strictObject({operation:z.literal('review'),commandId:id,id,expectedVersion:z.number().int().positive(),approve:z.boolean(),reason}),
 z.strictObject({operation:z.literal('withdraw'),commandId:id,id,expectedVersion:z.number().int().positive(),reason})]);
export type Correction={id:string;version:number;periodId:string;factId:string;taskTitle:string;state:'proposed'|'approved'|'rejected'|'withdrawn';baseRevision:number;appliedRevision:number|null;basisHash:string;previewHash:string;beforeShares:Shares;afterShares:Shares;beforeParts:ScorePart[];afterParts:ScorePart[];delta:{subject:string;baseMilli:number;scoreMilli:number}[];proposedBy:string;proposedAt:string;reason:string;reviewedBy?:string;reviewedAt?:string;reviewReason?:string};
export type ReconciledResult={subject:string;taskCount:number;originalBaseMilli:number;originalScoreMilli:number;deltaBaseMilli:number;deltaScoreMilli:number;adjustedBaseMilli:number;adjustedScoreMilli:number};
export function reconciliationCsv(rows:ReconciledResult[]){const cell=(v:unknown)=>{let s=String(v);if(typeof v==='string'&&/^[\s\u0000-\u001f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\ufeff'+[['账号','原参与任务数','原工作量点','原计分点','更正工作量点','更正计分点','核对工作量点','核对计分点'],...rows.map(r=>[r.subject,r.taskCount,r.originalBaseMilli/1000,r.originalScoreMilli/1000,r.deltaBaseMilli/1000,r.deltaScoreMilli/1000,r.adjustedBaseMilli/1000,r.adjustedScoreMilli/1000])].map(r=>r.map(cell).join(',')).join('\r\n');}
