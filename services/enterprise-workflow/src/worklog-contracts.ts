import {z} from 'zod';
import {calendarDate} from './contracts';
const id=z.string().uuid().transform(s=>s.toLowerCase()),text=z.string().trim().min(1).max(2000),version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const worklogValues=z.strictObject({workDate:calendarDate,minutes:z.number().int().min(1).max(1440),activity:z.enum(['production','rework','coordination']),note:text});
export const worklogCommand=z.strictObject({commandId:id,logId:id,expectedVersion:version,reason:text,action:z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('create'),orderId:id,taskId:id,expectedOrderVersion:version.min(1),values:worklogValues}),
 z.strictObject({type:z.literal('revise'),expectedOrderVersion:version.min(1),values:worklogValues}),
 z.strictObject({type:z.literal('withdraw')}),z.strictObject({type:z.literal('review'),approve:z.boolean()}),
 z.strictObject({type:z.literal('propose-correction'),expectedOrderVersion:version.min(1),values:worklogValues.nullable()}),
 z.strictObject({type:z.literal('review-correction'),approve:z.boolean()}),z.strictObject({type:z.literal('withdraw-correction')})])});
export const worklogQuery=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('list'),from:calendarDate,to:calendarDate,page:z.coerce.number().int().min(1).max(10000).default(1),scope:z.enum(['mine','team']).default('mine'),subject:z.string().max(254).default(''),status:z.enum(['','submitted','approved','rejected','withdrawn','void']).default(''),orderId:id.optional(),taskId:id.optional()}),
 z.strictObject({action:z.literal('detail'),id}),z.strictObject({action:z.literal('history'),id,page:z.coerce.number().int().min(1).max(10000).default(1)})]);
export type WorklogValues=z.infer<typeof worklogValues>;
export type Worklog={id:string;enterpriseId:string;teamId:string;subject:string;orderId:string;taskId:string;version:number;status:'submitted'|'approved'|'rejected'|'withdrawn'|'void';values:WorklogValues;createdAt:string;updatedAt:string;review?:{by:string;at:string;reason:string};pendingChange?:{values:WorklogValues|null;reason:string;at:string;by:string}|null};
