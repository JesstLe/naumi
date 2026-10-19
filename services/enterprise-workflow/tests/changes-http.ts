import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function checkChangesHttp(call:(path:string,body?:unknown,status?:number,who?:string)=>Promise<any>){
 const orderId=randomUUID(),taskId=randomUUID();let version=0;
 const action=async(who:string,a:any,status=200)=>{const c={commandId:randomUUID(),orderId,expectedVersion:version,action:a},r=await call('/v1/commands',c,status,who);if(status===200)version=r.order.version;return {c,r};};
 await action('worker',{type:'create',title:'变更闭环合成需求',brief:'原始范围',acceptance:'人工验收'});await action('worker',{type:'submit-requirement'});await action('manager',{type:'approve-requirement'});await action('manager',{type:'plan-tasks',tasks:[{id:taskId,title:'合成制作任务',kind:'design',points:3,dueAt:new Date(Date.now()+86400000).toISOString(),dependencyIds:[]}]});await action('manager',{type:'publish'});
 const original=await call('/v1/orders/'+orderId,undefined,200,'manager'),oldDue=original.tasks[0].dueAt,patch={tasks:[{taskId,points:7,dueAt:new Date(Date.now()+3*86400000).toISOString()}]},preview=await call('/v1/change-preview',{orderId,expectedVersion:version,patch},200,'worker');assert.equal(preview.impact.deltaPoints,4);
 const changeId=randomUUID(),proposal=await action('worker',{type:'propose-change',changeId,reason:'合成活动延期增加制作量',patch});assert.equal(proposal.r.order.tasks[0].points,3);assert.equal((await call('/v1/commands',proposal.c,200,'worker')).replayed,true);
 await action('worker',{type:'approve-change',changeId,side:'business',reason:'self deny'},403);await action('reviewer',{type:'approve-change',changeId,side:'business',reason:'需求方批准'});await action('manager',{type:'approve-change',changeId,side:'execution',reason:'执行方批准'});const applied=await action('manager',{type:'apply-change',changeId,reason:'应用新承诺'});assert.equal(applied.r.order.tasks[0].points,7);assert.equal(applied.r.order.tasks[0].commitmentBaseline.dueAt,oldDue);assert.equal((await call('/v1/commands',applied.c,200,'manager')).replayed,true);
 const detail=await call('/v1/orders/'+orderId+'/detail',undefined,200,'manager');assert.equal(detail.order.changes[0].status,'applied');assert.equal(detail.changeControl.enabled,true);
 console.log('CHANGES_HTTP_PASS: preview=1 native_commands=1 independent_pair=1 applied=1 original_commitment=1 replay=1 history=1');return {orderId,taskId,changeId};
}
