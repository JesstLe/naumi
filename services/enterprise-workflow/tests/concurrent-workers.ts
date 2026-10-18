import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {RuntimeConfig} from '../src/runtime-config';

/** Real BFF + real Workers, only called by the owned disposable production fixture. */
export async function runConcurrentWorkers(o:{origin:string;source:{query:(text:string,values?:any[])=>Promise<any>};workflow:{query:(text:string,values?:any[])=>Promise<any>};enterpriseId:string;sourceId:string;config:RuntimeConfig;workerControlPort:number;output:string;login:(email:string)=>Promise<string>;createAccount:(email:string)=>Promise<void>;provision:(input:unknown)=>Promise<void>}){
 assert(process.env.NAUMI_VERIFY_ISOLATED_DB==='1'&&process.env.NAUMI_COMPOSITION_ACTIVE_LOAD==='1');
 assert.equal(new URL(o.origin).hostname,'127.0.0.1');assert.equal(o.config.installationId,'web-composition');assert.equal(o.config.connectors.length,0);
 assert.equal((await o.source.query('SELECT current_database() AS name')).rows[0].name,'source_composition');
 assert.equal((await o.workflow.query('SELECT current_database() AS name')).rows[0].name,'workflow_composition');
 const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms)),teamId=randomUUID(),manager='load-manager@composition.fixture.invalid',users=Array.from({length:8},(_,i)=>({email:`load-${i}@composition.fixture.invalid`,subject:'load-'+i}));
 const records:{kind:string;status:number;ms:number;bytes:number}[]=[],orders:{id:string;taskId:string;version:number;cookie:string;subject:string;assetId:string;sha:string;bytes:Buffer}[]=[];
 const sourceOwner=(await o.source.query('SELECT owner_email FROM app_account_teams WHERE id=$1',[o.sourceId])).rows[0].owner_email;
 for(const email of [manager,...users.map(x=>x.email)]){await o.createAccount(email);await o.source.query('INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment)VALUES($1,$2,$3,NULL,\'permanent\')',[o.sourceId,email,email===manager?sourceOwner:manager]);}
 await o.provision({commandId:randomUUID(),reason:'isolated eight-person concurrent workload',confirmedSourceSubjects:true,enterprises:[{enterpriseId:o.enterpriseId,teams:[{teamId,name:'Concurrent fixture'}],accounts:[{subject:'load-manager',sourceSubject:manager,memberships:[{teamId,permissions:['request','manage','dispatch','review'],workKinds:[]}]},...users.map(u=>({subject:u.subject,sourceSubject:u.email,memberships:[{teamId,permissions:['request','execute'],workKinds:['design']}]}))]}]});
 const managerCookie=await o.login(manager);
 const fetchChecked=async(path:string,cookie:string,body?:unknown)=>{const r=await fetch(o.origin+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin:o.origin,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});if(r.status!==200){let code='UNEXPECTED';try{const d=await r.json() as any;const value=d.error?.code??d.error;if(typeof value==='string'&&/^[A-Z0-9_]+$/.test(value))code=value;}catch{}throw Error('CONCURRENT_HTTP_'+r.status+'_'+code);}return r;};
 const api=async(action:string,cookie:string,extra:Record<string,string>={},body?:unknown)=>{const r=await fetchChecked('/api/enterprise/workflow?'+new URLSearchParams({action,enterpriseId:o.sourceId,teamId,...extra}),cookie,body);return await r.json() as any;};
 await api('schedule-command',managerCookie,{}, {commandId:randomUUID(),teamId,expectedVersion:0,reason:'explicit concurrent team workbook',action:{type:'initialize'}});
 await api('schedule',managerCookie);
 const today=new Date().toISOString().slice(0,10),monday=new Date(today+'T00:00:00Z');monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));const week=monday.toISOString().slice(0,10);
 for(const [index,user]of users.entries()){
  const cookie=await o.login(user.email),id=randomUUID(),taskId=randomUUID();let version=0;
  const act=async(action:unknown,who=managerCookie)=>{const d=await api('command',who,{}, {commandId:randomUUID(),orderId:id,expectedVersion:version,action});version=d.order.version;return d;};
  await act({type:'create',title:'Concurrent fixture '+index,brief:'synthetic only',acceptance:'eight-user workload'},cookie);await act({type:'submit-requirement'},cookie);await act({type:'approve-requirement'});await act({type:'plan-tasks',tasks:[{id:taskId,title:'Concurrent design '+index,kind:'design',points:1,dueAt:new Date(Date.now()+1800000).toISOString(),dependencyIds:[]}]});await act({type:'publish'});await act({type:'set-task-plan',taskId,planStart:today,planEnd:today,estimatedHours:1,scheduleTag:'',customValues:{},reason:'bounded workload'});await act({type:'claim',taskId},cookie);await act({type:'start',taskId},cookie);
  const bytes=Buffer.alloc(8*1024*1024,index+1),assetId=randomUUID(),sha=createHash('sha256').update(bytes).digest('hex');orders.push({id,taskId,version,cookie,subject:user.subject,assetId,sha,bytes});
 }
 // Eight authenticated users upload eight distinct 8MiB files concurrently, not one shared session.
 let uploadBackpressure=0;
 const uploadStarted=performance.now();await Promise.all(orders.map(async(order,index)=>{const started=performance.now();let completed=false;
  for(let attempt=0;attempt<12;attempt++){
   const r=await fetch(o.origin+'/api/enterprise/workflow/files?'+new URLSearchParams({enterpriseId:o.sourceId,teamId,assetId:order.assetId,orderId:order.id,taskId:order.taskId,expectedVersion:String(order.version),name:'concurrent.bin'}),{method:'POST',headers:{cookie:order.cookie,origin:o.origin,'content-type':'application/octet-stream'},body:new Uint8Array(order.bytes),signal:AbortSignal.timeout(120000)});
   if(r.status===429){const d=await r.json() as any;assert.equal(d.error?.code??d.error,'UPLOAD_BUSY','ONLY_EXPLICIT_BACKPRESSURE_RETRY');uploadBackpressure++;await pause(500+index*60);continue;}
   assert.equal(r.status,200,'UPLOAD_'+r.status);const d=await r.json() as any;assert.equal(d.asset.bytes,order.bytes.length);records.push({kind:'upload',status:r.status,ms:performance.now()-started,bytes:order.bytes.length});completed=true;break;
  }
  assert(completed,'BOUNDED_UPLOAD_RETRY_EXHAUSTED');
 }));
 const uploadElapsedMs=performance.now()-uploadStarted;
 const settings=await fetchChecked('/api/enterprise/workflow/sla?'+new URLSearchParams({enterpriseId:o.sourceId,teamId,action:'settings'}),managerCookie);const policy=await settings.json() as any;
 const slaPath='/api/enterprise/workflow/sla?'+new URLSearchParams({enterpriseId:o.sourceId,teamId});
 const input={expectedVersion:policy.version,config:{enabled:true,rules:[{kind:'due',enabled:true,minutes:60,escalateMinutes:120}]},reason:'active runtime real reminder workload'},plan=await(await fetchChecked(slaPath,managerCookie,{operation:'preview',input})).json() as any;
 await fetchChecked(slaPath,managerCookie,{operation:'save',input:{...input,commandId:randomUUID(),asOf:plan.asOf,previewHash:plan.previewHash}});
 const workerBase='http://127.0.0.1:'+o.config.workerPort,workerHeaders={authorization:'Bearer '+o.config.controlToken,'content-type':'application/json'},state=await(await fetch(workerBase+'/internal/lifecycle/status',{headers:workerHeaders})).json() as any;
 const activate=await fetch(workerBase+'/internal/lifecycle/activate',{method:'POST',headers:workerHeaders,body:JSON.stringify({installationId:o.config.installationId,releaseId:o.config.releaseId,slot:o.config.slot,bootId:state.bootId,role:'worker',operationId:randomUUID(),reason:'isolated bounded workload'})});assert.equal(activate.status,202);
 const controlBase='http://127.0.0.1:'+o.workerControlPort,controlHeaders={'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET!,'content-type':'application/json'};
 const controlStatus=async()=>await(await fetch(controlBase+'/status',{headers:controlHeaders})).json() as any;
 const control=async(action:'resume'|'drain')=>{const s=await controlStatus();const r=await fetch(controlBase+'/control',{method:'POST',headers:controlHeaders,body:JSON.stringify({action,operationId:randomUUID(),bootId:s.bootId,expectedRevision:s.revision})});assert.equal(r.status,200,'NAUMI_CONTROL_'+r.status);return r.json();};
 await control('resume');
 const started=performance.now();let active=0,maxInFlight=0,readBytes=0;
 await Promise.all(orders.map(async order=>{
  for(let round=0;round<40;round++){
   const kind=['dashboard','order','week','download'][round%4],t=performance.now();active++;maxInFlight=Math.max(maxInFlight,active);
   try{let response:Response;
    if(kind==='download')response=await fetchChecked('/api/enterprise/workflow/files?'+new URLSearchParams({action:'download',enterpriseId:o.sourceId,teamId,id:order.assetId}),order.cookie);
    else response=await fetchChecked('/api/enterprise/workflow?'+new URLSearchParams({action:kind,enterpriseId:o.sourceId,teamId,...(kind==='order'?{id:order.id}:kind==='week'?{start:week}:{scope:'mine'})}),order.cookie);
    let bytes=0;if(kind==='download'){const h=createHash('sha256');for await(const chunk of response.body as any){bytes+=chunk.length;h.update(chunk);}assert.equal(bytes,order.bytes.length);assert.equal(h.digest('hex'),order.sha);readBytes+=bytes;}
    else{const data=await response.json() as any;if(kind==='order')assert.equal(data.order.id,order.id);if(kind==='dashboard'||kind==='week'){assert(data.tasks.some((x:any)=>x.task.id===order.taskId));assert(data.tasks.every((x:any)=>x.task.assignee===order.subject));}}
    records.push({kind,status:response.status,ms:performance.now()-t,bytes});
   }finally{active--;}
   await pause(1000);
  }
 }));
 const elapsedMs=performance.now()-started;assert.equal(maxInFlight,8);assert.equal(readBytes,8*10*8*1024*1024);
 let occurrences=0;for(let i=0;i<90;i++){occurrences=Number((await o.workflow.query('SELECT count(DISTINCT task_id) n FROM enterprise_workflow.sla_occurrences WHERE enterprise_id=$1 AND team_id=$2 AND task_id=ANY($3::uuid[])',[o.enterpriseId,teamId,orders.map(x=>x.taskId)])).rows[0].n);if(occurrences===8)break;await pause(1000);}assert.equal(occurrences,8,'ACTIVE_WORKER_REMINDERS');
 const reminders=Number((await o.workflow.query("SELECT count(*) n FROM enterprise_workflow.notifications WHERE enterprise_id=$1 AND team_id=$2 AND action='sla-due'",[o.enterpriseId,teamId])).rows[0].n);assert(reminders>=8);
 assert.equal((await o.workflow.query('SELECT count(*) n FROM (SELECT clock_key,stage,count(*) FROM enterprise_workflow.sla_occurrences WHERE enterprise_id=$1 AND team_id=$2 GROUP BY clock_key,stage HAVING count(*)>1)t',[o.enterpriseId,teamId])).rows[0].n,'0');
 await control('drain');let worker;for(let i=0;i<90;i++){worker=await controlStatus();if(worker.tickDrainComplete)break;await pause(500);}assert(worker.tickDrainComplete&&worker.unresolvedTicks===0&&worker.lastTick?.phase==='complete','ACTIVE_NAUMI_WORKER_NOT_DRAINED');
 const ticks=await o.source.query("SELECT count(*) FILTER(WHERE phase='completed')::int AS completed,count(*) FILTER(WHERE phase<>'completed')::int AS unsettled FROM app_worker_tick_receipts WHERE worker_instance_id=$1",[worker.instanceId]);assert(ticks.rows[0].completed>=2&&ticks.rows[0].unsettled===0,'REAL_TICK_RECEIPTS_REQUIRED');
 const activity=(await o.source.query("SELECT coalesce(sum((result->>'processed')::int),0)::int AS processed FROM app_worker_tick_receipts WHERE worker_instance_id=$1",[worker.instanceId])).rows[0];assert.equal(activity.processed,0,'UNEXPECTED_SOURCE_PAID_WORK');
 const latencies=records.map(x=>x.ms).sort((a,b)=>a-b),report={users:8,managerAccounts:1,iterationsPerUser:40,successfulRequests:records.length,httpAttempts:records.length+uploadBackpressure,uploadBackpressure,readRequests:320,concurrency:8,maxInFlight,elapsedMs,uploadElapsedMs,uploadedBytes:64*1024*1024,downloadedBytes:readBytes,allBodiesVerified:true,p50Ms:latencies[Math.ceil(latencies.length*.5)-1],p95Ms:latencies[Math.ceil(latencies.length*.95)-1],maxMs:latencies.at(-1),statusCounts:{200:records.length,429:uploadBackpressure},slaTaskOccurrences:occurrences,reminderNotifications:reminders,naumiCompletedTicks:ticks.rows[0].completed,naumiUnsettledTicks:0,workflowWorkerActivated:true,naumiWorkerDrained:true,providerCalls:0,productionReleased:false,targetCapacityAccepted:false,scope:'eight native users; paced full-body reads plus8 concurrent8MiB upload submissions; explicit UPLOAD_BUSY backoff preserves2-inflight server limit; real reminder rows and actual source-worker receipts; no paid jobs, no target47 or dual-slot load'};
 await writeFile(join(o.output,'CONCURRENT_WORKERS.json'),JSON.stringify(report,null,2));console.log('CONCURRENT_WORKERS_PASS: users8=1 native_sessions=1 requests328=1 concurrent8=1 upload64MiB=1 download640MiB=1 actual_sla8=1 actual_tick_receipts=1 providers0=1');return report;
}
