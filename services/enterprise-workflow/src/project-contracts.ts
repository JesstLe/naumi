import {z} from 'zod';
const id=z.string().uuid().transform(v=>v.toLowerCase()),text=z.string().trim().min(1).max(2000),title=text.max(120),hash=z.string().regex(/^[a-f0-9]{64}$/),subject=z.string().trim().min(1).max(254);
export const milestoneSchema=z.strictObject({id,title,targetAt:z.string().datetime({offset:true}),critical:z.boolean(),dependsOn:z.array(id).max(29)});
export const projectInput=z.strictObject({commandId:id,id,expectedVersion:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),reason:text,action:z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('create'),code:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/),title,brief:text}),
 z.strictObject({type:z.literal('edit'),title,brief:text,ownerSubject:subject}),
 z.strictObject({type:z.literal('milestones'),milestones:z.array(milestoneSchema).max(30)}),
 z.strictObject({type:z.literal('invite'),teamId:id}),z.strictObject({type:z.literal('remove-unavailable'),teamId:id}),z.strictObject({type:z.literal('consent'),approve:z.boolean()}),z.strictObject({type:z.literal('revoke'),teamId:id}),
 z.strictObject({type:z.literal('link'),orderId:id,milestoneId:id.nullable()}),z.strictObject({type:z.literal('unlink'),orderId:id}),
 z.strictObject({type:z.literal('create-demand'),orderId:id,title,brief:text,acceptance:text,milestoneId:id.nullable()}),
 z.strictObject({type:z.literal('transition'),status:z.enum(['approved','active','retrospective','archived'])}),z.strictObject({type:z.literal('reopen')})])});
export const projectApply=projectInput.extend({previewHash:hash,confirmed:z.literal(true)});
export const projectQuery=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('list'),query:z.string().max(120).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('invitations'),page:z.coerce.number().int().min(1).max(10000).default(1)}),
 z.strictObject({action:z.literal('detail'),id}),z.strictObject({action:z.literal('history'),id,page:z.coerce.number().int().min(1).max(10000).default(1)})]);
export type ProjectInput=z.infer<typeof projectInput>;
export type Milestone=z.infer<typeof milestoneSchema>;
export type ProjectLink={orderId:string;milestoneId:string|null;teamId:string;linkedBy:string;linkedAt:string};
export type ProjectGrant={teamId:string;state:'invited'|'approved'|'revoked';invitedBy:string;invitedAt:string;decidedBy?:string;decidedAt?:string};
export type Project={id:string;enterpriseId:string;teamId:string;code:string;title:string;brief:string;ownerSubject:string;createdBy:string;createdAt:string;updatedAt:string;version:number;status:'planning'|'approved'|'active'|'retrospective'|'archived';milestones:Milestone[];grants:ProjectGrant[];links:ProjectLink[];archiveSnapshot?:ProjectSummary|null};
export type ProjectNumbers={orders:number;unavailable:number;committedPoints:number;acceptedPoints:number;blockedTasks:number;unplannedTasks:number;unfinishedOrders:number;ratio:number|null;ready:boolean};
export type ProjectSummary=ProjectNumbers&{unassigned:number;milestones:(ProjectNumbers&{id:string;late:boolean;dependencyBlocked:boolean})[];dataHash:string};
