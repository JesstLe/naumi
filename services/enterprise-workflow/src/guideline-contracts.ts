import {z} from 'zod';
const id=z.string().uuid().transform(s=>s.toLowerCase()),text=z.string().trim().min(1).max(2000),short=text.max(120),instant=z.string().datetime({offset:true});
export const guidelineDefinition=z.strictObject({title:short,channel:short,brandNotes:text,palette:z.array(z.string().regex(/^#[a-fA-F0-9]{6}$/)).max(12),typography:z.string().trim().max(1000),approvedClaims:z.string().trim().max(4000),restrictedClaims:z.string().trim().max(4000),sourceNote:text,validFrom:instant,validUntil:instant.nullable(),checks:z.array(z.strictObject({id,label:text.max(200),mandatory:z.boolean()})).min(1).max(10).refine(x=>new Set(x.map(c=>c.id)).size===x.length&&x.some(c=>c.mandatory))}).refine(d=>!d.validUntil||Date.parse(d.validUntil)>Date.parse(d.validFrom));
export const guidelineSelection=z.strictObject({id,revision:z.number().int().positive()});
export const guidelineCommand=z.strictObject({commandId:id,id,expectedVersion:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),reason:text,action:z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('save-draft'),brandId:id,definition:guidelineDefinition}),z.strictObject({type:z.literal('publish')}),z.strictObject({type:z.literal('withdraw'),revision:z.number().int().positive()})])});
export const guidelineQuery=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('list'),brandId:id.optional(),manage:z.enum(['','1']).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('order'),orderId:id}),z.strictObject({action:z.literal('detail'),id}),z.strictObject({action:z.literal('version'),id,revision:z.coerce.number().int().positive()}),
 z.strictObject({action:z.literal('history'),id,page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('impact'),id,revision:z.coerce.number().int().positive(),page:z.coerce.number().int().min(1).max(10000).default(1)})]);
export type GuidelineDefinition=z.infer<typeof guidelineDefinition>;
export type GuidelineBook={id:string;brandId:string;version:number;publishedRevision:number;draft:{definition:GuidelineDefinition;author:string}|null};
export type GuidelinePublished={definition:GuidelineDefinition;brandId:string;brandName:string;author:string;publishedBy:string;publishedAt:string;reason:string};
export type GuidelineSnapshot={id:string;teamId:string;revision:number;published:GuidelinePublished};
