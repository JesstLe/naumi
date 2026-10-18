import {z} from 'zod';
import {calendarDate} from './contracts';
const subject=z.string().trim().min(1).max(254),id=z.string().uuid().transform(s=>s.toLowerCase()),minutes=z.number().int().min(0).max(1440).multipleOf(15),page=z.coerce.number().int().min(1).max(10000).default(1);
export const capacityConfig=z.strictObject({weeklyMinutes:z.array(minutes).length(7),overrides:z.array(z.strictObject({date:calendarDate,minutes})).max(366),maxWip:z.number().int().min(1).max(100).nullable()}).refine(c=>new Set(c.overrides.map(x=>x.date)).size===c.overrides.length).transform(c=>({...c,overrides:[...c.overrides].sort((a,b)=>a.date.localeCompare(b.date))}));
export const capacityInput=z.strictObject({subject,from:calendarDate,to:calendarDate,expectedVersion:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),config:capacityConfig,reason:z.string().trim().min(1).max(2000)});
export const capacitySave=capacityInput.extend({commandId:id,previewHash:z.string().regex(/^[a-f0-9]{64}$/)});
export const capacityQuery=z.discriminatedUnion('action',[z.strictObject({action:z.literal('members'),query:z.string().max(120).default(''),page}),z.strictObject({action:z.literal('summary'),subject,from:calendarDate,to:calendarDate}),z.strictObject({action:z.literal('history'),subject,page})]);
export type CapacityConfig=z.infer<typeof capacityConfig>;
