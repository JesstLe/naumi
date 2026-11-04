import { sitePolicyInputSchema, sitePolicySchema } from '@/lib/site-control/contracts';
import { z } from 'zod';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {fleetBusinessQuerySchema,fleetBusinessSnapshotSchema} from './business-contracts';

const email = z.string().email().max(254).transform(v => v.toLowerCase());
export const operationSchema = z.discriminatedUnion('type', [
  fleetBusinessQuerySchema,
  z.object({ type: z.literal('creations.list'), search: z.string().max(100), page: z.number().int().min(1).max(10000) }).strict(),
  z.object({ type: z.literal('creations.media'), creationId: z.string().regex(/^cr-[a-f0-9-]{36}$/i), assetId: z.string().min(1).max(200) }).strict(),
  z.object({ type: z.literal('site.policy.get') }).strict(),
  z.object({ type: z.literal('site.policy.set'), policy: sitePolicyInputSchema, expectedRevision: z.number().int().min(0) }).strict(),
  z.object({ type: z.literal('users.list'), search: z.string().max(100), page: z.number().int().min(1).max(10000) }).strict(),
  z.object({ type: z.literal('users.ban'), email, banned: z.boolean(), expectedBanned: z.boolean() }).strict(),
  z.object({ type: z.literal('credits.adjust'), email, delta: z.number().int().min(-1000000).max(1000000).refine(v => v !== 0), reason: z.string().trim().min(1).max(120), months: z.number().int().min(0).max(1200).optional() }).strict(),
  z.object({ type: z.literal('features.get'), email }).strict(),
  z.object({ type: z.literal('features.set'), email, mode: z.enum(['default', 'custom']), allowed: z.array(z.string().max(80)).max(100), expectedVersion: z.number().int().min(0) }).strict(),
]);
export type FleetOperation = z.infer<typeof operationSchema>;
export const fleetCapabilities = ['read','users','credits','features','release','creations','business'] as const;
export type FleetCapability = typeof fleetCapabilities[number];
export type FleetActor = { actor: string; root: boolean };
/** Map each validated operation to the grant capability required by dispatch and enqueue checks; business reads remain separate from generic read access. */
export function commandCapability(operation: FleetOperation): FleetCapability {
  if(operation.type==='business.query')return 'business';
  if(operation.type==='creations.list'||operation.type==='creations.media')return 'creations';
  if(operation.type==='credits.adjust')return 'credits';
  if(operation.type==='features.set'||operation.type==='site.policy.set')return 'features';
  if(operation.type==='users.ban')return 'users';
  return 'read';
}
export const grantSchema = z.object({action:z.literal('grant'),instanceId:z.string().uuid(),email,allowed:z.array(z.enum(fleetCapabilities)).max(fleetCapabilities.length).refine(v=>new Set(v).size===v.length),expectedVersion:z.number().int().min(0),expiresAt:z.string().datetime().nullable()}).strict();
export const commandSchema = z.object({ id: z.string().uuid(), instanceId: z.string().uuid(), actor: z.string().min(1).max(254), expiresAt: z.number().int(), operation: operationSchema }).strict();
export type FleetCommand = z.infer<typeof commandSchema>;
export type SignedFleetCommand = { payload: string; signature: string };
export const statusSchema = z.object({ source: z.string().regex(/^[a-f0-9]{7,40}$/).or(z.literal('unknown')), version: z.string().max(80), storage: z.enum(['local', 'r2', 's3', 'unknown']), nas: z.enum(['unknown', 'ok', 'degraded']), connector: z.literal(1),business:z.literal(1).optional() }).strict();
export const pollSchema = z.object({ nonce: z.string().uuid(), timestamp: z.number().int(), status: statusSchema }).strict();
const userSchema = z.object({ email: z.string().max(254), name: z.string().max(120), banned: z.boolean(), role: z.string().max(24), creditsTotal: z.number(), creditsUsed: z.number() }).strict();
const httpsUrl=z.string().max(2400).url().refine(value=>new URL(value).protocol==='https:');
const dataSchema = z.union([
  z.object({business:fleetBusinessSnapshotSchema}).strict(),
  z.object({creations:z.array(z.object({id:z.string().max(80),title:z.string().max(100),actorName:z.string().max(254),status:z.string().max(40),createdAt:z.string().datetime(),assetId:z.string().max(200).nullable(),thumbnail:httpsUrl.nullable()}).strict()).max(12),total:z.number().int().min(0),page:z.number().int().positive()}).strict(),
  z.object({mediaUrl:httpsUrl}).strict(),
  z.object({ sitePolicy: sitePolicySchema.nullable() }).strict(),
  z.object({ users: z.array(userSchema).max(30), total: z.number().int().min(0), page: z.number().int().min(1) }).strict(),
  z.object({ email: z.string().max(254), banned: z.boolean() }).strict(),
  z.object({ email: z.string().max(254), applied: z.literal(true), operationId: z.string().uuid() }).strict(),
  z.object({ email: z.string().max(254), policy: z.object({ mode: z.enum(['default','custom']), allowed: z.array(z.string().max(80)).max(100), version: z.number().int() }).strict() }).strict(),
]);
export const resultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('succeeded'), data: dataSchema }).strict(),
  z.object({ status: z.literal('failed'), code: z.enum(['NOT_FOUND', 'CONFLICT', 'INVALID', 'DENIED','UNAVAILABLE']) }).strict(),
]);
export type FleetResult = z.infer<typeof resultSchema>;
export const ackSchema = z.object({ nonce: z.string().uuid(), timestamp: z.number().int(), commandId: z.string().uuid(), leaseId: z.string().uuid(), result: resultSchema }).strict();
export const createInstanceSchema = z.object({ action: z.literal('create'), id: z.string().uuid(), name: z.string().trim().min(1).max(80), kind: z.enum(['main', 'enterprise']), enabled: z.boolean().default(true) }).strict();
export const adminCommandSchema = z.object({ action: z.literal('command'), instanceId: z.string().uuid(), id: z.string().uuid(), operation: operationSchema }).strict();
export const instanceChangeSchema = z.object({ action: z.enum(['enable', 'revoke', 'rotate']), instanceId: z.string().uuid() }).strict();
export function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export function signCommand(command: FleetCommand, token: string): SignedFleetCommand {
  const payload = JSON.stringify(commandSchema.parse(command));
  return { payload, signature: createHmac('sha256', token).update(payload).digest('hex') };
}
export function verifyCommand(envelope: SignedFleetCommand, token: string, instanceId: string, now = Date.now()): FleetCommand {
  if (typeof envelope.payload !== 'string' || Buffer.byteLength(envelope.payload) > 12000 || !/^[a-f0-9]{64}$/.test(envelope.signature)) throw new Error('FLEET_INVALID_SIGNATURE');
  const expected = createHmac('sha256', token).update(envelope.payload).digest();
  if (!timingSafeEqual(expected, Buffer.from(envelope.signature, 'hex'))) throw new Error('FLEET_INVALID_SIGNATURE');
  const command = commandSchema.parse(JSON.parse(envelope.payload));
  if (command.instanceId !== instanceId || command.expiresAt < now || command.expiresAt > now + 360000) throw new Error('FLEET_INVALID_COMMAND');
  return command;
}
export function centralUrl(raw: string, isolated = false): string {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(isolated && url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname)))) throw new Error('FLEET_HTTPS_REQUIRED');
  return url.origin;
}
