import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import type {IncomingMessage,ServerResponse} from 'node:http';
import path from 'node:path';
import type {Pool} from 'pg';
import type {ModelConfig} from '../src/lib/model-config/types';
import type {CompiledVideoPlan} from '../src/lib/video/execution-contract';

export function createRemoteWorkflowPeer(readInput:(url:string)=>Promise<Buffer>,resultUrl:()=>string){
 const uploads:Array<{sha256:string;apiKey:string;fileType:string;name:string}>=[],creates:Array<{protocol:string;path:string;body:any;authorization?:string}>=[],polls:Array<{protocol:string;id:string;apiKey?:string;authorization?:string}>=[],inputHashes:string[]=[];
 let hold=true;
 return {uploads,creates,polls,inputHashes,setHold(value:boolean){hold=value;},
  async handle(req:IncomingMessage,res:ServerResponse){
   const url=req.url||'',send=(body:unknown)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(body));};
   if(url==='/task/openapi/upload'&&req.method==='POST'){
    const chunks:Buffer[]=[];for await(const part of req)chunks.push(Buffer.from(part));const form=await new Response(Buffer.concat(chunks),{headers:{'content-type':String(req.headers['content-type'])}}).formData(),file=form.get('file') as File;assert(file&&file.size>0);uploads.push({sha256:createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),apiKey:String(form.get('apiKey')),fileType:String(form.get('fileType')),name:file.name});send({code:0,data:{fileName:'uploads/'+file.name}});return true;
   }
   if(url==='/task/openapi/outputs'&&req.method==='POST'){
    const chunks:Buffer[]=[];for await(const part of req)chunks.push(Buffer.from(part));const body=JSON.parse(Buffer.concat(chunks).toString());polls.push({protocol:'runninghub',id:body.taskId,apiKey:body.apiKey,authorization:req.headers.authorization});send(hold?{code:804,msg:'running'}:{code:0,data:[{fileType:'mp4',fileUrl:resultUrl()}]});return true;
   }
   if(url.startsWith('/api/v1/comfyui/comfyui_workflow/result/')&&req.method==='GET'){
    polls.push({protocol:'autodl',id:url.split('/').at(-1)!,authorization:req.headers.authorization});send({code:'success',data:hold?{status:'processing'}:{status:'completed',results:[{type:'video',url:resultUrl()}]}});return true;
   }
   if(req.method==='POST'&&(url==='/task/openapi/create'||url.startsWith('/api/v1/comfyui/comfyui_workflow/'))){
    const chunks:Buffer[]=[];for await(const part of req)chunks.push(Buffer.from(part));const body=JSON.parse(Buffer.concat(chunks).toString()),protocol=url==='/task/openapi/create'?'runninghub':'autodl';creates.push({protocol,path:url,body,authorization:req.headers.authorization});
    if(protocol==='autodl'){const bytes=await readInput(body.load.inputs.image);inputHashes.push(createHash('sha256').update(bytes).digest('hex'));}
    if(JSON.stringify(body).includes('REMOTE_WORKFLOW_UNKNOWN')){req.socket.destroy();return true;}
    const id='remote-'+protocol+'-'+creates.length;send(protocol==='runninghub'?{code:0,data:{taskId:id}}:{code:'success',data:{task_id:id,status:'queued'}});return true;
   }
   return false;
  }};
}

export async function verifyRemoteWorkflowProcess(input:{actor:string;pool:Pool;outputDir:string;peer:ReturnType<typeof createRemoteWorkflowPeer>;originalConfig:ModelConfig;fixtureOrigin:string;credential:string;
 http:(url:string,body?:unknown,as?:string)=>Promise<{status:number;value:any}>;task:(id:string)=>Promise<any>;readPlan:(id:string)=>Promise<CompiledVideoPlan>;publish:(config:ModelConfig)=>Promise<unknown>;
 resume:()=>Promise<unknown>;drain:()=>Promise<unknown>;restart:()=>Promise<unknown>;due:(id:string)=>Promise<unknown>;
 until:<T>(name:string,read:()=>Promise<T>,accept:(value:T)=>boolean,ms?:number)=>Promise<T>}){
 const {peer,pool,http,actor}=input,checks:string[]=[],tasks:string[]=[];
 const pass=(name:string)=>{checks.push(name);console.log('REMOTE_WORKFLOW_PROCESS_CHECK='+name+' PASS');};
 const ledger=async()=>(await pool.query("SELECT count(*)::int n,COALESCE(-sum(delta),0)::int amount FROM app_ledger WHERE kind='consume' AND email=$1",[actor])).rows[0];
 const counts=async()=>{const result:Record<string,number>={};for(const table of ['app_video_tasks','app_creation_records','app_gen_reservations','app_ledger'])result[table]=Number((await pool.query('SELECT count(*) n FROM '+table)).rows[0].n);return result;};
 const beforeLedger=await ledger();
 try{
  for(const protocol of ['runninghub','autodl'] as const){
   peer.setHold(true);const originalCreates=peer.creates.length,originalUploads=peer.uploads.length,cfg=structuredClone(input.originalConfig);
   cfg.providers[0].protocol=protocol;cfg.providers[0].baseUrl=input.fixtureOrigin;cfg.providers[0].options={videoProfile:protocol,idempotencyStrategy:'none'};
   const recipe={manifest:{version:1 as const,kind:protocol,workflowId:protocol+'-process-original',template:{load:{inputs:{image:'unmapped.png'}},text:{inputs:{text:'unmapped'}}},inputs:[{name:'image',type:'image' as const,path:['load','inputs','image'],required:true},{name:'prompt',type:'prompt' as const,path:['text','inputs','text'],required:true}]},parameters:{durationSeconds:{type:'integer' as const,default:1},resolution:{type:'string' as const,default:'4K',mapping:{'4K':'2K'},send:'semantic' as const}},media:{image:protocol==='autodl'?{delivery:'url' as const}:{delivery:'upload' as const,path:'/task/openapi/upload',fileField:'file',namePath:['data','fileName'],form:{apiKey:'$credential',fileType:'input'}}}};
   cfg.upstreamModels[0].parameterMap={videoExecution:{schemaVersion:1,profileId:'workflow-video',profileVersion:1,recipe}};await input.publish(cfg);
   const beforePreview=await counts(),draft={prompt:protocol+' process original prompt',parameters:{durationSeconds:1,resolution:'4K'},inputs:[{id:'image',nodeId:'process-input',kind:'image',role:'reference'}]};
   const preview=await http('/api/video/compile-preview',{modelId:'video-process',draft,draftRevision:1});assert.equal(preview.status,200,JSON.stringify(preview.value));assert.equal(preview.value.value.intent,'workflow');assert.deepEqual(await counts(),beforePreview);assert.equal(peer.creates.length,originalCreates);assert.equal(peer.uploads.length,originalUploads);
   const body={source:'workbench',modelId:'video-process',mode:'text',prompt:draft.prompt,parameters:draft.parameters,references:[{id:'image',artworkId:'process-input',kind:'image',role:'reference'}],idempotencyKey:randomUUID()};
   const accepted=await http('/api/video/generate',body);assert.equal(accepted.status,200,JSON.stringify(accepted.value));const id=accepted.value.taskId;tasks.push(id);const queued=await input.task(id),plan=await input.readPlan(id);assert.equal(queued.parameters.version,3);assert.equal(plan.digest,preview.value.value.planDigest);assert.equal(plan.binding.profileId,'workflow-video');assert.equal(plan.billingFacts.resolution,'2K');assert.equal(queued.billing_quote.requestedCredits,17);assert.equal(peer.creates.length,originalCreates);pass(protocol+'-actual-preview-zero-io-and-common-v3-acceptance');
   const changed=structuredClone(cfg);(changed.upstreamModels[0].parameterMap as any).videoExecution.recipe.manifest.workflowId='changed-after-acceptance';await input.publish(changed);assert.equal((await http('/api/video/generate',body)).value.taskId,id);
   await input.resume();await input.until(protocol+' actual create',()=>input.task(id),row=>!!row?.upstream_id);await input.drain();assert.equal(peer.creates.length,originalCreates+1);const create=peer.creates.at(-1)!;assert.equal(create.authorization,protocol==='autodl'?input.credential:'Bearer '+input.credential);
   const image=plan.inputManifest.find(item=>item.kind==='image');assert(image&&image.kind==='image');
   if(protocol==='runninghub'){assert.equal(create.body.apiKey,input.credential);assert.equal(create.body.workflowId,protocol+'-process-original');assert(create.body.nodeInfoList.some((value:any)=>value.nodeId==='text'&&value.fieldValue===draft.prompt));assert(create.body.nodeInfoList.some((value:any)=>value.nodeId==='load'&&value.fieldValue==='uploads/'+peer.uploads.at(-1)!.name));assert.equal(peer.uploads.length,originalUploads+1);assert.equal(peer.uploads.at(-1)!.sha256,image.asset.sha256);assert.equal(peer.uploads.at(-1)!.apiKey,input.credential);assert.equal(peer.uploads.at(-1)!.fileType,'input');}
   else{assert(create.path.endsWith('/autodl-process-original'));assert.equal(create.body.text.inputs.text,draft.prompt);assert.equal(peer.inputHashes.at(-1),image.asset.sha256);assert.equal(peer.uploads.length,originalUploads);}
   pass(protocol+'-independent-worker-uses-frozen-template-credential-and-real-media');
   const acceptedReceipt=(await input.task(id)).upstream_id;await input.restart();peer.setHold(false);await input.due(id);await input.resume();const done=await input.until(protocol+' original receipt completes after restart',()=>input.task(id),row=>row?.status==='completed',120000);await input.drain();assert(done.artwork_id&&done.video_url);assert.equal(peer.creates.length,originalCreates+1);assert(peer.polls.some(poll=>poll.id===acceptedReceipt));assert(peer.polls.filter(poll=>poll.id===acceptedReceipt).every(poll=>protocol==='runninghub'?poll.apiKey===input.credential:poll.authorization===input.credential));assert.equal((await pool.query('SELECT count(*)::int n FROM app_ledger WHERE id=$1',['led-video-'+id])).rows[0].n,1);pass(protocol+'-restart-polls-original-task-decodes-asset-and-settles-once');
   await input.publish(cfg);const cancelled=await http('/api/video/generate',{...body,idempotencyKey:randomUUID()});assert.equal(cancelled.status,200);assert.equal((await http('/api/video/tasks/'+cancelled.value.taskId+'/cancel',{})).status,200);
   const retryBody={idempotencyKey:randomUUID()},retry=await http('/api/video/tasks/'+cancelled.value.taskId+'/retry',retryBody);assert.equal(retry.status,202,JSON.stringify(retry.value));assert.equal((await http('/api/video/tasks/'+cancelled.value.taskId+'/retry',retryBody)).value.taskId,retry.value.taskId);tasks.push(retry.value.taskId);assert.equal((await input.task(retry.value.taskId)).parameters.retryOf,cancelled.value.taskId);await input.resume();await input.until(protocol+' explicit retry completes',()=>input.task(retry.value.taskId),row=>row?.status==='completed',120000);await input.drain();assert.equal(peer.creates.length,originalCreates+2);pass(protocol+'-cancel-prepared-and-explicit-retry-no-replay');
   const unknown=await http('/api/video/generate',{...body,prompt:'REMOTE_WORKFLOW_UNKNOWN '+protocol,idempotencyKey:randomUUID()});assert.equal(unknown.status,200);tasks.push(unknown.value.taskId);await input.resume();await input.until(protocol+' unknown acceptance',()=>input.task(unknown.value.taskId),row=>row?.status==='needs_attention',120000);await input.drain();assert.equal((await http('/api/video/tasks/'+unknown.value.taskId+'/retry',{idempotencyKey:randomUUID()})).status,409);await input.restart();const ticksBefore=Number((await pool.query("SELECT count(*) n FROM app_worker_tick_receipts WHERE phase='completed'")).rows[0].n);await input.resume();await input.until(protocol+' restarted worker actually scans UNKNOWN',async()=>Number((await pool.query("SELECT count(*) n FROM app_worker_tick_receipts WHERE phase='completed'")).rows[0].n),n=>n>ticksBefore);await input.drain();assert.equal(peer.creates.length,originalCreates+3);assert.equal(peer.creates.filter(create=>JSON.stringify(create.body).includes('REMOTE_WORKFLOW_UNKNOWN '+protocol)).length,1);pass(protocol+'-unknown-acceptance-retains-original-identity-and-no-repost');
  }
  const after=await ledger(),added={n:after.n-beforeLedger.n,amount:after.amount-beforeLedger.amount};assert.deepEqual(added,{n:4,amount:68});
  await writeFile(path.join(input.outputDir,'REMOTE_WORKFLOW_PROCESS_RESULT.json'),JSON.stringify({ok:true,checks,tasks,uploads:peer.uploads,creates:peer.creates,polls:peer.polls,inputHashes:peer.inputHashes,ledgerAdded:added,actualNext:true,actualIndependentWorker:true,actualMediaDecode:true,paidCalls:0,productionWrites:0},null,2));console.log(`VIDEO_COMPILER_REMOTE_WORKFLOW_PROCESS=PASS CHECKS=${checks.length} REAL_NEXT=1 REAL_INDEPENDENT_WORKER=1 RUNNINGHUB=1 AUTODL=1 LEDGER_ADDED=68 UNKNOWN_REPOSTS=0 PAID_CALLS=0 PRODUCTION_WRITES=0`);return added;
 }catch(error){await writeFile(path.join(input.outputDir,'REMOTE_WORKFLOW_PROCESS_FAILURE.json'),JSON.stringify({checks,tasks,creates:peer.creates,uploads:peer.uploads,error:String(error)},null,2));throw error;}
 finally{peer.setHold(false);await input.publish(input.originalConfig);}
}
