import {z} from 'zod';
const id=z.string().uuid().transform(s=>s.toLowerCase()),fieldId=z.string().regex(/^f_[a-z][a-z0-9_]{0,47}$/),key=z.string().regex(/^[a-z][a-z0-9_]{0,47}$/);
const scalar=z.union([z.string().max(2000),z.number().finite(),z.boolean(),z.null()]);
export const formValues=z.record(fieldId,scalar).refine(v=>Object.keys(v).length<=30);
export const formField=z.strictObject({id:fieldId,label:z.string().trim().min(1).max(80),help:z.string().max(240),type:z.enum(['text','textarea','number','date','select','boolean']),required:z.boolean(),maxLength:z.number().int().min(1).max(2000),min:z.number().finite().min(-1e9).max(1e9).nullable(),max:z.number().finite().min(-1e9).max(1e9).nullable(),options:z.array(z.strictObject({id:key,label:z.string().trim().min(1).max(80)})).max(50),visibleWhen:z.strictObject({fieldId,equals:z.union([key,z.boolean()])}).nullable()});
export const attachmentRules=z.strictObject({minCount:z.number().int().min(0).max(20),maxCount:z.number().int().min(1).max(20),maxFileBytes:z.number().int().min(1).max(33554432),allowedExtensions:z.array(z.string().regex(/^[a-z0-9]{1,12}$/)).max(20)}).refine(v=>v.minCount<=v.maxCount&&new Set(v.allowedExtensions).size===v.allowedExtensions.length);
export const formDefinition=z.strictObject({title:z.string().trim().min(1).max(120),description:z.string().max(500),catalogRequired:z.boolean(),attachmentRules:attachmentRules.optional(),fields:z.array(formField).min(1).max(30)}).superRefine((d,ctx)=>{
 const seen=new Map<string,z.infer<typeof formField>>();for(const [index,f]of d.fields.entries()){
  const bad=(message:string)=>ctx.addIssue({code:'custom',message,path:['fields',index]});if(seen.has(f.id))bad('FORM_DUPLICATE_FIELD');if(f.min!==null&&f.max!==null&&f.min>f.max)bad('FORM_INVALID_RANGE');
  if(f.type==='select'&&(!f.options.length||new Set(f.options.map(o=>o.id)).size!==f.options.length))bad('FORM_INVALID_OPTIONS');if(f.type!=='select'&&f.options.length)bad('FORM_OPTIONS_NOT_APPLICABLE');if(f.type!=='number'&&(f.min!==null||f.max!==null))bad('FORM_RANGE_NOT_APPLICABLE');
  if(f.visibleWhen){const parent=seen.get(f.visibleWhen.fieldId);if(!parent||parent.type==='boolean'&&typeof f.visibleWhen.equals!=='boolean'||parent.type==='select'&&!parent.options.some(o=>o.id===f.visibleWhen!.equals)||!['boolean','select'].includes(parent.type))bad('FORM_INVALID_CONDITION');}seen.set(f.id,f);
 }
});
export type FormDefinition=z.infer<typeof formDefinition>;
export type FormValues=z.infer<typeof formValues>;
export const formSelection=z.strictObject({templateId:id,revision:z.number().int().positive(),values:formValues});
export type FormSnapshot={templateId:string;teamId:string;revision:number;definition:FormDefinition;values:FormValues};
export type FormBook={id:string;version:number;enabled:boolean;publishedRevision:number;draft:{definition:FormDefinition;author:string}|null};
export const formCommand=z.strictObject({commandId:id,templateId:id,expectedVersion:z.number().int().min(0),reason:z.string().trim().min(1).max(2000),action:z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('save-draft'),definition:formDefinition}),z.strictObject({type:z.literal('publish')}),z.strictObject({type:z.literal('set-enabled'),enabled:z.boolean()}),
])});
export const formQuery=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('list'),manage:z.enum(['','1']).default(''),page:z.coerce.number().int().min(1).max(10000).default(1),query:z.string().max(120).default('')}),
 z.strictObject({action:z.literal('detail'),id}),z.strictObject({action:z.literal('version'),id,revision:z.coerce.number().int().positive()}),z.strictObject({action:z.literal('history'),id,page:z.coerce.number().int().min(1).max(10000).default(1)}),
]);
