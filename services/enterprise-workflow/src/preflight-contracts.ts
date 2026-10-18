import {z} from 'zod';
const id=z.string().uuid().transform(v=>v.toLowerCase()),count=z.number().int().min(1).max(20),dimension=z.number().int().min(1).max(32768);
export const imageSpecification=z.strictObject({label:z.string().trim().min(1).max(120),versionLabel:z.string().trim().min(1).max(80),sourceNote:z.string().trim().min(1).max(2000),formats:z.array(z.enum(['png','jpeg'])).min(1).max(2).refine(v=>new Set(v).size===v.length),minFiles:count,maxFiles:count,minWidth:dimension,maxWidth:dimension,minHeight:dimension,maxHeight:dimension,maxBytes:z.number().int().min(1).max(32*1024*1024),alpha:z.enum(['any','forbid','require']),aspect:z.strictObject({width:z.number().int().min(1).max(32768),height:z.number().int().min(1).max(32768),toleranceBps:z.number().int().min(0).max(1000)}).nullable()}).refine(v=>v.minFiles<=v.maxFiles&&v.minWidth<=v.maxWidth&&v.minHeight<=v.maxHeight,{message:'SPEC_RANGE_REVERSED'});
export const preflightCommand=z.strictObject({id,publicationId:id,expectedVersion:z.number().int().positive(),spec:imageSpecification});
export const preflightQuery=z.discriminatedUnion('action',[z.strictObject({action:z.literal('list'),publicationId:id,page:z.coerce.number().int().min(1).max(10000).default(1)}),z.strictObject({action:z.literal('detail'),publicationId:id,id})]);
export type ImageSpecification=z.infer<typeof imageSpecification>;
export type ImageMeasurement={format:'png'|'jpeg';width:number;height:number;bytes:number;transparent:boolean;originalWidth:number;originalHeight:number;orientation:number};
export type PreflightIssue={code:string;expected:unknown;actual:unknown};
export type ImageInspection={status:'checked';measurement:ImageMeasurement}|{status:'incomplete'|'fail';code:string};
