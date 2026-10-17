import {z} from 'zod';
import {routingFieldsSchema} from './contracts';
const id=z.string().uuid().transform(s=>s.toLowerCase()),text=z.string().trim().min(1).max(2000);
export const demandEntry=z.strictObject({orderId:id,title:text,brief:text,acceptance:text,routingFields:routingFieldsSchema.optional(),copy:z.strictObject({orderId:id,version:z.number().int().positive(),includeForm:z.boolean(),includeCatalog:z.boolean(),includeRouting:z.boolean()}).optional()}).refine(e=>!e.copy||e.copy.orderId!==e.orderId,'DEMAND_COPY_SELF').refine(e=>!e.copy?.includeRouting||!e.routingFields,'DEMAND_ROUTING_AMBIGUOUS');
export const demandBatchInput=z.strictObject({batchId:id,entries:z.array(demandEntry).min(1).max(20),reason:text}).refine(x=>new Set(x.entries.map(e=>e.orderId)).size===x.entries.length,'DEMAND_DUPLICATE_ID').refine(x=>!x.entries.some(e=>e.copy&&x.entries.some(t=>t.orderId===e.copy!.orderId)),'DEMAND_SOURCE_TARGET_OVERLAP');
export const demandBatchApply=demandBatchInput.safeExtend({previewHash:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)});
export const demandBatchQuery=z.discriminatedUnion('action',[z.strictObject({action:z.literal('list'),page:z.coerce.number().int().min(1).max(10000).default(1)}),z.strictObject({action:z.literal('detail'),id})]);
export type DemandEntry=z.infer<typeof demandEntry>;
export type DemandBatchInput=z.infer<typeof demandBatchInput>;
