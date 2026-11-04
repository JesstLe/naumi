import {z} from 'zod';

export const fleetBusinessViews=['overview','usage','users','orders','ledger','creations'] as const;
export const fleetBusinessQuerySchema=z.object({
  type:z.literal('business.query'), view:z.enum(fleetBusinessViews),
  days:z.union([z.literal(7),z.literal(30),z.literal(90),z.literal(365)]),
  asOf:z.string().datetime(),page:z.number().int().min(1).max(10000),
  search:z.string().trim().max(100),email:z.string().email().max(254).transform(v=>v.toLowerCase()).optional(),
}).strict();
export const businessQuerySchema=fleetBusinessQuerySchema;
export type FleetBusinessQuery=z.infer<typeof fleetBusinessQuerySchema>;
const amount=z.number().finite().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const at=z.string().datetime();
const person=z.object({
  email:z.string().max(254),name:z.string().max(80),role:z.string().max(24),plan:z.string().max(32),banned:z.boolean(),
  balance:amount.nullable(),creditsTotal:amount.nullable(),creditsUsed:amount.nullable(),
  credits:amount.nonnegative(),operations:count,lastUsedAt:at.nullable(),
}).strict();
const daily=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),credits:amount.nonnegative(),operations:count}).strict();
const order=z.object({id:z.string().max(200),email:z.string().max(254),title:z.string().max(100),kind:z.string().max(40),
  credits:amount,amount:amount,status:z.string().max(40),createdAt:at,paidAt:at.nullable()}).strict();
const ledger=z.object({id:z.string().max(200),email:z.string().max(254),kind:z.string().max(40),delta:amount,
  reason:z.string().max(160),createdAt:at}).strict();
const creation=z.object({id:z.string().max(200),email:z.string().max(254),title:z.string().max(100),createdAt:at,
  projectKey:z.string().max(200).nullable(),type:z.enum(['image','video','unknown']),status:z.string().max(40)}).strict();
export const fleetBusinessSnapshotSchema=z.object({
  schemaVersion:z.literal(1),view:z.enum(fleetBusinessViews),asOf:at,from:at,observedAt:at,
  timeZone:z.literal('Asia/Shanghai'),scope:z.literal('site'),page:z.number().int().positive(),pageSize:z.literal(30),total:count,
  totals:z.object({credits:amount.nonnegative(),operations:count,activeUsers:count,balance:amount.nullable(),users:count,
    artworks:count,paidOrders:count,paidAmount:amount,refundCredits:amount.nonnegative(),administrativeDebits:amount.nonnegative()}).strict(),
  users:z.array(person).max(30),daily:z.array(daily).max(367),orders:z.array(order).max(30),
  ledger:z.array(ledger).max(30),creations:z.array(creation).max(30),
}).strict();
export const businessSnapshotSchema=fleetBusinessSnapshotSchema;
export type FleetBusinessSnapshot=z.infer<typeof fleetBusinessSnapshotSchema>;
export const FLEET_BUSINESS_MAX_BYTES=42000;
/** A reply is either fully validated and bounded, or unavailable. Never truncate totals or silently drop rows. */
export function parseFleetBusinessSnapshot(raw:unknown):FleetBusinessSnapshot {
  const snapshot=fleetBusinessSnapshotSchema.parse(raw);
  if(new TextEncoder().encode(JSON.stringify({status:'succeeded',data:{business:snapshot}})).byteLength>FLEET_BUSINESS_MAX_BYTES)
    throw new Error('FLEET_BUSINESS_RESPONSE_TOO_LARGE');
  return snapshot;
}
