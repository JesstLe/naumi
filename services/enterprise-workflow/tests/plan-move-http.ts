import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
/** Run only against the caller's isolated HTTP fixture; creates actual workflow commands. */
export async function checkMoveHttp(call:(action:'preview'|'command',body:unknown,expected?:number)=>Promise<any>,assignee:string){
 const orderId=randomUUID(),taskId=randomUUID();let version=0;
 const run=async(action:unknown)=>{const r=await call('command',{commandId:randomUUID(),orderId,expectedVersion:version,action});version=r.order.version;return r.order;};
 await run({type:'create',title:'HTTP move acceptance',brief:'isolated',acceptance:'same task'});await run({type:'submit-requirement'});await run({type:'approve-requirement'});await run({type:'plan-tasks',tasks:[{id:taskId,title:'HTTP planned task',kind:'design',points:1,dueAt:'2026-11-30T12:00:00Z',dependencyIds:[]}]});await run({type:'set-task-plan',taskId,planStart:'2026-10-19',planEnd:'2026-10-20',estimatedHours:12,scheduleTag:'',customValues:{},reason:'initial plan'});await run({type:'publish'});const before=await run({type:'assign',taskId,assignee});
 const input={orderId,taskId,expectedVersion:version,targetStart:'2026-10-26',reason:'HTTP move after preview'},plan=await call('preview',input),command={commandId:randomUUID(),orderId,expectedVersion:version,action:{type:'move-task-plan',taskId,targetStart:input.targetStart,reason:input.reason,previewHash:plan.previewHash,acknowledged:true}};
 assert.equal(plan.proposed.planEnd,'2026-10-27');const changed=await call('command',command);assert.deepEqual(changed.order.tasks[0],{...before.tasks[0],planStart:'2026-10-26',planEnd:'2026-10-27'});assert.equal(changed.order.version,version+1);assert.equal((await call('command',command)).replayed,true);await call('command',{...command,commandId:randomUUID()},409);
}
