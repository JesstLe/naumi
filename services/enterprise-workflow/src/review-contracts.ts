import {z} from 'zod';
import type {GuidelineSnapshot} from './guideline-contracts';
const id=z.string().uuid().transform(s=>s.toLowerCase()),text=z.string().trim().min(1).max(2000),version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const reviewers=z.array(z.string().trim().min(1).max(254)).min(1).max(5).refine(v=>new Set(v).size===v.length);
const check=z.strictObject({id,label:z.string().trim().min(1).max(200)});
export const reviewCommand=z.strictObject({commandId:id,reviewId:id,expectedVersion:version,reason:text,action:z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('open'),orderId:id,taskId:id,expectedOrderVersion:version.min(1),reviewers,checks:z.array(check).min(1).max(20).refine(v=>new Set(v.map(x=>x.id)).size===v.length)}),
 z.strictObject({type:z.literal('panel'),reviewers}),
 z.strictObject({type:z.literal('issue'),issueId:id,assetId:id,text,point:z.strictObject({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).nullable()}),
 z.strictObject({type:z.literal('reply'),issueId:id,text}),
 z.strictObject({type:z.literal('resolve'),issueId:id,resolved:z.boolean()}),
 z.strictObject({type:z.literal('verdict'),verdict:z.enum(['approve','changes']),checks:z.array(z.strictObject({id,result:z.enum(['pass','fail','na']),note:z.string().trim().max(2000)})).min(1).max(20)})])});
export const reviewQuery=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('context'),orderId:id,taskId:id,page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('detail'),id}),z.strictObject({action:z.literal('history'),id,page:z.coerce.number().int().min(1).max(10000).default(1)})]);
export type DeliveryReview={id:string;enterpriseId:string;teamId:string;orderId:string;taskId:string;version:number;createdAt:string;updatedAt:string;
 submission:{id:string;version:number;at:string;assets:{id:string;revision:number;sha256:string;bytes:number;name:string}[]};
 guideline?:GuidelineSnapshot;requiredCheckIds?:string[];
 reviewers:string[];checks:{id:string;label:string}[];
 issues:{id:string;assetId:string;by:string;at:string;text:string;point:{x:number;y:number}|null;resolved:boolean;resolution?:{by:string;at:string;note:string};replies:{by:string;at:string;text:string}[]}[];
 decisions:{by:string;at:string;verdict:'approve'|'changes';note:string;checks:{id:string;result:'pass'|'fail'|'na';note:string}[]}[];
};
