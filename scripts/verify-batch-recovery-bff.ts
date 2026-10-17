import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function verifyBatchRecoveryBff(source:{root:string;foreign:string;ordinary:string;owner:string},teamId:string){
 const native=await import('../src/lib/native-auth'),api=await import('../src/app/api/enterprise/workflow/route');
 const request=(action:string,email=source.owner,body?:unknown,extra:Record<string,string>={})=>new Request('http://fixture.invalid/api/enterprise/workflow?'+new URLSearchParams({action,enterpriseId:source.root,teamId,...extra}),{method:body?'POST':'GET',headers:{cookie:email?'nv_user='+native.signUserSession(email,Date.now()):'',origin:'http://fixture.invalid','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const post=async(action:string,body:unknown)=>{const r=await api.POST(request(action,source.owner,body));assert.equal(r.status,200,await r.clone().text());return r.json();};
 const items=[];
 for(const title of ['浏览器断点恢复 A','浏览器断点恢复 B']){const orderId=randomUUID(),taskId=randomUUID();let version=0;for(const action of [{type:'create',title,brief:'synthetic batch recovery',acceptance:'independent review'},{type:'submit-requirement'},{type:'approve-requirement'},{type:'plan-tasks',tasks:[{id:taskId,title,kind:'design',points:1,dueAt:new Date(Date.now()+86400000).toISOString(),dependencyIds:[]}]},{type:'publish'}]){const d=await post('command',{commandId:randomUUID(),orderId,expectedVersion:version,action});version=d.order.version;}items.push({orderId,taskId,expectedVersion:version});}
 const input={batchId:randomUUID(),items,operation:{type:'assign',assignee:'worker'},reason:'BFF restart evidence'},plan=await post('batch-plan',input);
 assert.equal((await api.GET(request('batch-get','',undefined,{id:plan.batchId}))).status,401);assert.equal((await api.GET(request('batch-get',source.ordinary,undefined,{id:plan.batchId}))).status,403);assert.equal((await api.GET(request('batch-get',source.owner,undefined,{id:plan.batchId,teamId:randomUUID()}))).status,403);assert.equal((await api.GET(request('batch-get',source.owner,undefined,{id:plan.batchId,enterpriseId:source.foreign}))).status,404);
 const noOrigin=request('batch-run',source.owner,{batchId:plan.batchId,orderId:items[0].orderId,planHash:plan.planHash});noOrigin.headers.delete('origin');assert.equal((await api.POST(noOrigin)).status,403);
 assert.equal((await api.POST(request('command',source.owner,{...plan.groups[0].command,commandId:randomUUID()}))).status,409);
 await post('batch-run',{batchId:plan.batchId,orderId:items[0].orderId,planHash:plan.planHash});const r=await api.GET(request('batch-get',source.owner,undefined,{id:plan.batchId}));assert.equal(r.status,200);const resumed=await r.json();assert.equal(resumed.groups[0].state,'success');assert.equal(resumed.groups[1].state,'ready');assert.equal((await post('batch-plan',input)).planHash,plan.planHash);
 assert.equal((await api.GET(request('batch-list'))).status,200);
 console.log('BATCH_RECOVERY_BFF_PASS: session=1 anonymous401=1 worker403=1 team403=1 foreign404=1 origin403=1 plan200=1 partial_reopen=1 replay=1 list200=1 legacy_body409=1');
}
