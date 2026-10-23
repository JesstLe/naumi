import { z } from 'zod';
import {ALL_FEATURE_IDS} from '@/lib/feature-access/catalog';

export const tenantStatus = z.enum(['active', 'suspended', 'expired']);
const tenantPolicyShape = z.record(z.string().min(1).max(80), z.boolean());
export const tenantPolicy = tenantPolicyShape.refine(value=>Object.keys(value).every(key=>ALL_FEATURE_IDS.includes(key)),{message:'功能权益包含未知功能'});
export const tenantConfiguration = {
  name: z.string().trim().min(2).max(80),
  validUntil: z.string().datetime({ offset: true }).nullable(),
  seatLimit: z.number().int().min(1).max(1000000).nullable(),
  entitlementName: z.string().trim().min(1).max(80).nullable(),
  featurePolicy: tenantPolicy,
};
export const createTenantSchema = z.object({
  commandId: z.string().uuid(), ...tenantConfiguration,
  ownerEmail: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  reuseTeamId: z.string().uuid().optional(),
}).strict();
export const updateTenantSchema = z.object({
  commandId: z.string().uuid(), expectedVersion: z.number().int().nonnegative(),
  ...tenantConfiguration, featurePolicy:tenantPolicyShape, status: z.enum(['active', 'suspended']),
  reason: z.string().trim().min(1).max(500),
}).strict();
const memberBase={commandId:z.string().uuid(),email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),reason:z.string().trim().min(1).max(500)};
export const tenantMemberSchema=z.discriminatedUnion('action',[
  z.object({...memberBase,action:z.literal('attach'),expectedVersion:z.number().int().nonnegative().nullable(),
    roleId:z.string().uuid().nullable(),supervisorEmail:z.string().trim().email().transform(v=>v.toLowerCase()),
    employment:z.enum(['permanent','intern']),expiresAt:z.string().datetime({offset:true}).nullable()}).strict(),
  z.object({...memberBase,action:z.literal('remove'),expectedVersion:z.number().int().nonnegative()}).strict(),
]);
export const tenantQuerySchema = z.object({
  q: z.string().trim().max(100).default(''), status: z.enum(['active','suspended','expired','expiring']).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['name', 'createdAt']).default('createdAt'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).superRefine((q, ctx) => {
  for (const key of ['from','to'] as const) if (q[key] && (!Number.isFinite(Date.parse(q[key]!)) || new Date(q[key]!).toISOString().slice(0,10) !== q[key])) ctx.addIssue({code:'custom', path:[key], message:'日期无效'});
  if (q.from && q.to && (q.from > q.to || Date.parse(q.to)-Date.parse(q.from)>366*86400000)) ctx.addIssue({code:'custom', path:['to'],message:'日期范围须在一年内'});
});
export type TenantFilters = z.infer<typeof tenantQuerySchema>;
export type TenantSummary = {
  tenantId: string; name: string; owner: { email: string; name: string };
  status: z.infer<typeof tenantStatus>; entitlementName: string|null;
  validUntil: string|null; seatLimit: number|null; activeMembers: number;
  version: number; featurePolicy: Record<string,boolean>;
  createdAt: string; updatedAt: string;
  creationCount: number|null; lastActivityAt: string|null;
};
export type TenantList = {
  items: TenantSummary[]; total: number; page: number; size: number;
  appliedFilters: TenantFilters; generatedAt: string;
  scope: 'platform'; availability: 'available';
};
