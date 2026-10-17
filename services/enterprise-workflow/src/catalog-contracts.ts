import {z} from 'zod';
const id=z.string().uuid().transform(v=>v.toLowerCase()),name=z.string().trim().min(1).max(120),text=z.string().trim().max(2000),ids=z.array(id).max(100).refine(x=>new Set(x).size===x.length);
const externalRef=z.strictObject({system:z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),instance:z.string().trim().min(1).max(100),key:z.string().trim().min(1).max(200)}).nullable().default(null);
const common={id,name,enabled:z.boolean(),externalRef};
export const catalogDocument=z.discriminatedUnion('kind',[
 z.strictObject({...common,kind:z.literal('brand')}),
 z.strictObject({...common,kind:z.literal('shop'),channel:name,teamIds:ids}),
 z.strictObject({...common,kind:z.literal('product'),brandId:id,sellingPoints:text}),
 z.strictObject({...common,kind:z.literal('sku'),productId:id,shopIds:ids.min(1),specification:text,barcode:z.string().trim().max(100).nullable()}),
]);
export type CatalogDocument=z.infer<typeof catalogDocument>;
export type CatalogEntity={id:string;kind:CatalogDocument['kind'];version:number;document:CatalogDocument};
const version=z.number().int().positive();
export const catalogSelection=z.strictObject({shopId:id,skuId:id,revisions:z.strictObject({brand:version,shop:version,product:version,sku:version})});
export type CatalogSnapshot={selection:z.infer<typeof catalogSelection>;brand:CatalogEntity;shop:CatalogEntity;product:CatalogEntity;sku:CatalogEntity};
export const catalogInput=z.strictObject({entries:z.array(z.strictObject({expectedVersion:z.number().int().min(0),document:catalogDocument})).min(1).max(50),reason:z.string().trim().min(1).max(2000)});
export const catalogApply=catalogInput.extend({commandId:id,previewHash:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)});
export const catalogQuery=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('context')}),
 z.strictObject({action:z.literal('list'),kind:z.enum(['brand','shop','product','sku']),shopId:id.optional(),query:z.string().max(120).default(''),page:z.coerce.number().int().min(1).max(10000).default(1),manage:z.enum(['','1']).default('')}),
 z.strictObject({action:z.literal('history'),id,page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('selection'),shopId:id,skuId:id}),
]);
