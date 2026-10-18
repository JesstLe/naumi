import {z} from 'zod';
import {catalogSelection,type CatalogSnapshot} from './catalog-contracts';
import type {GuidelineSnapshot} from './guideline-contracts';
const id=z.string().uuid().transform(v=>v.toLowerCase()),text=z.string().trim().min(1).max(2000),instant=z.string().datetime({offset:true}),hash=z.string().regex(/^[a-f0-9]{64}$/);
const url=z.string().trim().max(2000).refine(s=>{if(!s)return true;try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}});
export const publicationDraft=z.strictObject({orderId:id,taskId:id,selection:catalogSelection,externalObjectId:z.string().trim().min(1).max(200),slot:z.string().trim().min(1).max(80),locale:z.string().trim().regex(/^[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*$/).min(2).max(30).transform(v=>v.replaceAll('_','-').toLowerCase()),scheduleAt:instant.nullable()});
const receipt={reportedAt:instant,evidence:text,url};
export const publicationCommand=z.strictObject({commandId:id,id,expectedVersion:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),reason:text,action:z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('create'),draft:publicationDraft,previewHash:hash}),z.strictObject({type:z.literal('approve')}),z.strictObject({type:z.literal('start')}),z.strictObject({type:z.literal('cancel')}),
 z.strictObject({type:z.literal('receipt'),outcome:z.enum(['published','failed','unknown']),...receipt}),z.strictObject({type:z.literal('mark-unknown')}),
 z.strictObject({type:z.literal('resolve'),outcome:z.enum(['published','failed']),...receipt}),z.strictObject({type:z.literal('request-recall')}),
 z.strictObject({type:z.literal('recall-receipt'),outcome:z.enum(['recalled','unknown']),...receipt}),z.strictObject({type:z.literal('link-replacement'),replacementId:id})])});
export const publicationPreview=z.strictObject({id,draft:publicationDraft});
export const publicationQuery=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('list'),status:z.enum(['','draft','approved','executing','unknown','manual_published','failed','cancelled','recall_requested','recall_unknown','manual_recalled']).default(''),orderId:id.optional(),shopId:id.optional(),page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('detail'),id}),z.strictObject({action:z.literal('history'),id,page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('source'),orderId:id,taskId:id})]);
export type PublicationDraft=z.infer<typeof publicationDraft>;
export type PublicationSource={orderId:string;taskId:string;orderTitle:string;taskTitle:string;acceptanceId:string;acceptedAt:string;participants:string[];guideline:GuidelineSnapshot|null;files:{id:string;revision:number;name:string;bytes:number;sha256:string}[]};
export type Publication={id:string;enterpriseId:string;teamId:string;version:number;status:'draft'|'approved'|'executing'|'unknown'|'manual_published'|'failed'|'cancelled'|'recall_requested'|'recall_unknown'|'manual_recalled';createdBy:string;createdAt:string;updatedAt:string;source:PublicationSource;target:CatalogSnapshot;externalObjectId:string;slot:string;locale:string;scheduleAt:string|null;approvedBy?:string;approvedAt?:string;executor?:string;startedAt?:string;receipt?:{outcome:string;reportedAt:string;recordedAt:string;by:string;evidence:string;url:string;source:'manual_report'};recall?:{requestedBy:string;requestedAt:string;reason:string;receipt?:{outcome:string;reportedAt:string;recordedAt:string;by:string;evidence:string;url:string;source:'manual_report'}};replacementId?:string;};
