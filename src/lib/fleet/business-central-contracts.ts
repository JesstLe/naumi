import {z} from 'zod';
import type {FleetBusinessQuery,FleetBusinessSnapshot} from './business-contracts';

export const businessRequestSchema=z.object({
  site:z.union([z.literal('all'),z.literal('local'),z.string().uuid()]).default('all'),
  view:z.enum(['overview','usage','users','orders','ledger','creations']),
  days:z.union([z.literal(7),z.literal(30),z.literal(90),z.literal(365)]).default(30),
  page:z.number().int().min(1).max(10000).default(1),search:z.string().trim().max(100).default(''),
  refresh:z.boolean().default(false),
  email:z.string().email().max(254).transform(v=>v.toLowerCase()).optional(),
}).strict();
export type FleetBusinessRequest=z.infer<typeof businessRequestSchema>;
export type BusinessSite={id:string;name:string;kind:'local'|'main'|'enterprise';enabled:boolean;lastSeen:string|null};
export type BusinessSource=Pick<BusinessSite,'id'|'name'|'kind'>&{
  status:'pending'|'succeeded'|'failed'|'offline'|'unknown';commandId?:string;
  data?:FleetBusinessSnapshot;error?:string;
};
export type FleetBusinessResponse={requestId:string;query:FleetBusinessQuery;sites:BusinessSite[];sources:BusinessSource[];complete:boolean};
