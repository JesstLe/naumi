import 'server-only';
import type {AccountImageGrant} from '../accounts/creation-policy';
import {accountImageGrantSchema} from '../accounts/creation-policy';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import { TeamError } from "@/lib/teams/errors";

// One in-process scope store shared by HTTP ingress, execution and durable recovery.


export type CreationContext={accountImage?:AccountImageGrant;actorEmail:string;scopeKind:'personal'|'tenant';tenantId:string|null;creationId?:string;requestText?:string;parameters?:Record<string,unknown>;sourcePath?:string;parentContext?:string;workspaceExplicit?:boolean;evidencePending?:boolean;originalInputs?:{storageRef:string;mime:string;role:string;position:number}[]};
const storage=new AsyncLocalStorage<CreationContext>();
export const currentCreationContext=()=>storage.getStore();
export function withFrozenCreation<T>(value:CreationContext|undefined,run:()=>Promise<T>){return value?storage.run(value,run):storage.exit(run);}
/** Legacy sources must not inherit a tenant from the request resuming them. */
export function withoutCreationContext<T>(run:()=>Promise<T>){return storage.exit(run);}
export function frozenCreationScope(value:unknown,email?:string):CreationContext|undefined {
 const parsed=z.object({accountImage:accountImageGrantSchema.optional(),actorEmail:z.string().min(1).max(254),scopeKind:z.enum(['personal','tenant']),tenantId:z.string().uuid().nullable(),creationId:z.string().max(200).optional(),requestText:z.string().max(50000).optional(),parameters:z.record(z.string(),z.unknown()).optional(),sourcePath:z.string().optional(),parentContext:z.string().max(240).optional()}).safeParse(value);
 if(!parsed.success)return undefined;const c=parsed.data;if(email&&c.actorEmail!==email.toLowerCase()||(c.scopeKind==='tenant')!==(c.tenantId!==null))throw new TeamError('冻结创作归属无效',409);return c;
}
export function creationId(){return `cr-${randomUUID()}`;}

// Only the ingress adapter needs direct run/getStore access.
export {storage as creationStorage};
