import { z } from 'zod';

export const creationStatuses = ['queued','running','succeeded','partial','failed','cancel_requested','cancelled','needs_review'] as const;
export type CreationStatus = typeof creationStatuses[number];
export type EvidenceState = 'recorded'|'not_recorded'|'unavailable'|'not_applicable'|'restricted';
export const creationFiltersSchema = z.object({
  tenantId:z.string().uuid().optional(), q:z.string().max(200).default(''), user:z.string().max(254).default(''),
  status:z.enum(creationStatuses).optional(),source:z.string().max(100).optional(),
  page:z.coerce.number().int().min(1).max(100000).default(1),size:z.coerce.number().int().min(1).max(100).default(20),
  from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).superRefine((v,c)=>{for(const k of ['from','to'] as const)if(v[k]&&(!Number.isFinite(Date.parse(v[k]!))||new Date(v[k]!).toISOString().slice(0,10)!==v[k]))c.addIssue({code:'custom',message:'日期无效'});if(v.from&&v.to&&(v.to<v.from||Date.parse(v.to)-Date.parse(v.from)>366*86400000))c.addIssue({code:'custom',message:'日期范围无效'});});
export type CreationFilters = z.infer<typeof creationFiltersSchema>;
export type CreationSummary = {id:string;title:string;actorEmail:string;actorName:string;tenantId:string|null;scopeKind:'personal'|'tenant'|'legacy_unconfirmed';sourceKind:string;status:CreationStatus;acceptedAt:string;settledCredits:number|null;thumbnailAssetId:string|null;completeness:EvidenceState};
export type CreationAsset = {id:string;direction:'input'|'output';role:string;position:number;inputPosition?:number;executionRef?:string;variant:'original'|'processed';mime:string|null;bytes:number|null;hash:string|null;availability:EvidenceState;mediaType:'image'|'video'|'audio'|'file';text?:string};
export type CreationEvent = {id:string;eventKey:string;type:string;status:string;summary:string;occurredAt:string;observedAt:string};
export type EvidencePagination={page:number;size:number;total:number};
export type CreationDetail = CreationSummary & {evidencePending:boolean;request:{state:EvidenceState;text:string|null};parameters:{state:EvidenceState;values:Record<string,unknown>};model:{state:EvidenceState;label:string|null};assets:CreationAsset[];events:CreationEvent[];children:CreationSummary[];assetPagination:EvidencePagination;eventPagination:EvidencePagination;childPagination:EvidencePagination;billing:{payerAccountId:string|null;source:string;quoted:number|null;reserved:number|null;charged:number|null;released:number|null;refunded:number|null;state:string;operations:{id:string;state:string;charged:number|null}[]};technical?:Record<string,unknown>};
export type CreationPage = {items:CreationSummary[];pagination:{total:number;page:number;size:number};appliedFilters:CreationFilters;generatedAt:string;scope:'platform'|'tenant'|'member';availability:'available';summary:{total:number;activeMembers:number;settledCredits:number|null;pending:number;failed:number;needsReview:number};memberUsage:{email:string;name:string;settledCredits:number}[]};

export function creationStatus(raw:unknown):CreationStatus {
 const s=String(raw||'');if(creationStatuses.includes(s as CreationStatus))return s as CreationStatus;
 if(['done','completed','success'].includes(s))return 'succeeded';if(['error','rejected'].includes(s))return 'failed';
 if(['pending','reviewing'].includes(s))return 'queued';if(['processing','generating'].includes(s))return 'running';
 return 'needs_review';
}
