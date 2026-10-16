import { z } from 'zod';
import type { Pool } from 'pg';
import { imagegenMetadataSchema } from '../imagegen/capabilities';
import { readSupplierModel, saveSupplierModel, SupplierMetadataError } from './repository';
import { supplierMetadataSchema, type SupplierMetadata } from './types';

const sha=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(160);
/** A ledger phase/HTTP200 without an actual input and decoded output is not proof. */
export const imagegenEditObservationSchema=z.strictObject({
  id:z.uuid(),providerId:id,modelId:id,callId:z.uuid(),supplierOperation:id,
  observedAt:z.iso.datetime(),endpoint:z.literal('/images/edits'),
  referenceCount:z.number().int().positive().max(32),referenceSha256:sha,
  request:z.strictObject({ratio:z.string().regex(/^\d+:\d+$/),resolution:z.enum(['1K','2K','4K']),quantity:z.literal(1)}),
  httpStatus:z.literal(200),delivered:z.literal(1),outputDecoded:z.literal(true),
  output:z.strictObject({sha256:sha,width:z.number().int().positive(),height:z.number().int().positive(),bytes:z.number().int().positive()}),
});
export type ImagegenEditObservation=z.infer<typeof imagegenEditObservationSchema>;

export function addImagegenEditObservation(source:SupplierMetadata,raw:ImagegenEditObservation):SupplierMetadata {
  const observation=imagegenEditObservationSchema.parse(raw),next=structuredClone(source);
  const prior=imagegenMetadataSchema.parse(next.parameterMetadata.supplierImagegenEvidence||{});
  const observations=z.array(imagegenEditObservationSchema).max(50).parse(next.parameterMetadata.supplierImagegenObservations||[]);
  const existing=observations.find(x=>x.id===observation.id||x.callId===observation.callId);
  if(existing){if(JSON.stringify(existing)!==JSON.stringify(observation))throw new SupplierMetadataError('OPERATION_CONFLICT','实测记录编号已用于不同证据',409);return supplierMetadataSchema.parse(next);}
  const sourceText=`真实参考图编辑 POST /images/edits；call ${observation.callId}；${observation.referenceCount}参考图/${observation.request.ratio}/${observation.request.resolution}/n=1；HTTP200、delivered=1、像素解码${observation.output.width}x${observation.output.height}；output SHA256 ${observation.output.sha256}；仅声明edit，不外推精确尺寸、其他档位或当前健康`;
  next.parameterMetadata.supplierImagegenEvidence={capabilities:{...prior.capabilities,edit:{state:'supported',source:sourceText,checkedAt:observation.observedAt.slice(0,10)}},wireMap:{...prior.wireMap}};
  next.parameterMetadata.supplierImagegenObservations=[...observations.slice(-49),observation];
  return supplierMetadataSchema.parse(next);
}

/** Versioned, revision-checked write; never edits manual imagegen, pricing or live config. */
export async function recordImagegenEditObservation(pool:Pool,input:{modelId:string;expectedRevision:number;actor:string;observation:ImagegenEditObservation}) {
  const observation=imagegenEditObservationSchema.parse(input.observation),record=await readSupplierModel(pool,input.modelId);
  if(record.providerId!==observation.providerId||record.modelId!==observation.modelId)throw new SupplierMetadataError('MODEL_MISMATCH','实测证据与供应商实际模型不符',409);
  const {id:_id,providerId:_p,providerName:_n,modelId:_m,label:_l,catalogOwner:_o,revision:_r,lastSeenAt:_s,updatedAt:_t,...metadata}=record;
  const next=addImagegenEditObservation(metadata,observation);
  if(JSON.stringify(metadata)===JSON.stringify(next))return {id:record.id,revision:record.revision,replayed:true};
  return saveSupplierModel(pool,{id:observation.id,modelId:record.id,expectedRevision:input.expectedRevision,metadata:next,actor:input.actor});
}

export function removeImagegenEditObservation(current:SupplierMetadata,original:SupplierMetadata,raw:ImagegenEditObservation):SupplierMetadata {
  const observation=imagegenEditObservationSchema.parse(raw),expected=addImagegenEditObservation(original,observation);
  if(JSON.stringify(current.parameterMetadata.supplierImagegenEvidence)!==JSON.stringify(expected.parameterMetadata.supplierImagegenEvidence)||JSON.stringify(current.parameterMetadata.supplierImagegenObservations)!==JSON.stringify(expected.parameterMetadata.supplierImagegenObservations))throw new SupplierMetadataError('REVISION_CONFLICT','实测能力已被后续更新，先核对再撤销',409);
  const restored=structuredClone(current);
  for(const key of ['supplierImagegenEvidence','supplierImagegenObservations']){
    if(Object.hasOwn(original.parameterMetadata,key))restored.parameterMetadata[key]=structuredClone(original.parameterMetadata[key]);
    else delete restored.parameterMetadata[key];
  }
  return supplierMetadataSchema.parse(restored);
}
