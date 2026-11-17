import {z} from 'zod';
import {id} from './contracts';
const connector=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/),subject=z.string().trim().min(1).max(254),reason=z.string().trim().min(1).max(2000);
export const notificationQuery=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('badge')}),
 z.strictObject({action:z.literal('inbox'),page:z.coerce.number().int().min(1).max(10000).default(1),unread:z.enum(['','1']).default('')}),
 z.strictObject({action:z.literal('deliveries'),page:z.coerce.number().int().min(1).max(10000).default(1),state:z.enum(['','pending','retry','sending','accepted','polling','delivered','blocked','dead','unknown','cancelled']).default('')}),
 z.strictObject({action:z.literal('settings')}),
 z.strictObject({action:z.literal('audit'),before:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(Number.MAX_SAFE_INTEGER)})
]);
export const notificationCommand=z.strictObject({commandId:id,expectedVersion:z.number().int().nonnegative(),reason,action:z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('read'),id}),
 z.strictObject({type:z.literal('policy'),enabled:z.boolean(),connectorId:connector}),
 z.strictObject({type:z.literal('binding'),subject,userid:z.string().trim().regex(/^[a-zA-Z0-9_.@-]{1,128}$/),enabled:z.boolean()}),
 z.strictObject({type:z.literal('retry'),id}),
 z.strictObject({type:z.literal('receipt'),id,receipt:z.string().regex(/^[1-9][0-9]{0,14}$/)})
])});
export type DeliveryOutcome={state:'accepted';receipt:string}|{state:'delivered';read:boolean}|{state:'pending'}|{state:'retry'|'dead'|'unknown';code:string};
export interface NotificationAdapter {
 send(input:{id:string;userid:string;title:string}):Promise<DeliveryOutcome>;
 poll(input:{receipt:string;userid:string}):Promise<DeliveryOutcome>;
}
export type NotificationConnector={id:string;revision:string;label:string;adapter:NotificationAdapter};
export const notificationTitles:Record<string,string>={
 'request-pause':'申请暂停或恢复','approve-pause':'批准暂停或恢复','reject-pause':'拒绝暂停或恢复','withdraw-pause':'撤回暂停或恢复','apply-pause':'应用暂停或恢复','request-cancellation':'需求取消待独立审批','approve-cancellation':'需求取消审批已更新','reject-cancellation':'需求取消申请已拒绝','withdraw-cancellation':'需求取消申请已撤回','apply-cancellation':'需求已按批准取消',
 'propose-handover-package':'任务交接资料待核对','accept-handover-package':'任务交接资料已确认接收',
 'propose-change':'需求变更待双方审核','approve-change':'需求变更审批已更新','reject-change':'需求变更已拒绝','withdraw-change':'需求变更已撤回','apply-change':'需求新基线已应用',
 'submit-requirement':'需求待受理','route-resolved':'需求已确认归属','return-requirement':'需求已退回补充','approve-requirement':'需求已批准',publish:'任务待认领',release:'任务已释放',assign:'任务待本人确认','batch-tasks':'任务批量指派','set-task-plan':'任务排期已调整','move-task-plan':'任务日期已调整',claim:'任务已认领',block:'任务执行受阻',resume:'任务已恢复','submit-delivery':'交付待独立验收','request-rework':'交付需要返工','accept-delivery':'交付已验收','propose-handover':'任务交接待确认','accept-handover':'任务交接已接收','decline-handover':'任务交接已拒绝','cancel-handover':'任务交接已撤销','operations-signoff':'运营已签收','operations-followup':'运营提出后续修改',cancel:'需求已取消'
};
