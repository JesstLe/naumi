import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import type {IncomingMessage,ServerResponse} from 'node:http';
import path from 'node:path';
import type {Pool} from 'pg';
import type {CompiledVideoPlan} from '../src/lib/video/execution-contract';

type Scenario={name:string;tool:string;args:Record<string,unknown>};
/** Scripted LLM HTTP peer only. Agent runtime, harness, quotation, tools and
 * internal HTTP are deliberately not replaced. This does not test LLM quality. */
export function createAgentProcessPeer(){
 const scenarios=new Map<string,Scenario>();
 const calls:Array<{scenario:string;model:string;authorization?:string;tool:string;phase:'tool'|'answer';toolResult?:string}>=[];
 return {calls,register(scenario:Scenario){const marker='AGENT_PROCESS_'+randomUUID();scenarios.set(marker,scenario);return marker;},
  async handle(req:IncomingMessage,res:ServerResponse){
   if(req.url!=='/v1/chat/completions'||req.method!=='POST')return false;
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString());
   const messages=body.messages as Array<{role:string;content:any}>;
   const userIndex=messages.findLastIndex(message=>message.role==='user'&&JSON.stringify(message.content).includes('AGENT_PROCESS_'));
   const marker=[...scenarios.keys()].find(key=>JSON.stringify(messages[userIndex]?.content).includes(key));assert(marker,'Unknown scripted Agent request');
   const scenario=scenarios.get(marker)!;assert.equal(body.model,'wire-agent-process');assert.equal(body.stream,true);assert(body.tools.some((tool:any)=>tool.function?.name===scenario.tool));
   const toolResult=messages.slice(userIndex+1).find(message=>message.role==='tool');
   calls.push({scenario:scenario.name,model:body.model,authorization:req.headers.authorization,tool:scenario.tool,phase:toolResult?'answer':'tool',...(toolResult?{toolResult:JSON.stringify(toolResult.content)}:{})});
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
   const id='chatcmpl-'+randomUUID(),chunk=(delta:unknown,finish_reason:string|null=null)=>res.write('data: '+JSON.stringify({id,object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:body.model,choices:[{index:0,delta,finish_reason}]})+'\n\n');
   chunk({role:'assistant',content:''});
   if(toolResult){chunk({content:'已读取实际工具回执。'});chunk({},'stop');}
   else{const args=JSON.stringify(scenario.args),middle=Math.floor(args.length/2);chunk({tool_calls:[{index:0,id:'call_'+randomUUID(),type:'function',function:{name:scenario.tool,arguments:args.slice(0,middle)}}]});chunk({tool_calls:[{index:0,function:{arguments:args.slice(middle)}}]});chunk({},'tool_calls');}
   res.end('data: [DONE]\n\n');return true;
  }};
}

export async function verifyVideoAgentProcess(input:{actor:string;pool:Pool;outputDir:string;peer:ReturnType<typeof createAgentProcessPeer>;credential:string;sourceArtworkId:string;
 http:(url:string,body?:unknown,as?:string)=>Promise<{status:number;value:any}>;otherCookie:string;task:(id:string)=>Promise<any>;readPlan:(id:string)=>Promise<CompiledVideoPlan>;
 resume:()=>Promise<unknown>;drain:()=>Promise<unknown>;posts:()=>number;
 until:<T>(name:string,read:()=>Promise<T>,accept:(value:T)=>boolean,ms?:number)=>Promise<T>}){
 const {pool,http,peer,actor}=input,checks:string[]=[],tasks:string[]=[],replies:any[]=[];
 const pass=(name:string)=>{checks.push(name);console.log('AGENT_PROCESS_CHECK='+name+' PASS');};
 const ledger=async()=>(await pool.query("SELECT count(*)::int n,COALESCE(-sum(delta),0)::int amount FROM app_ledger WHERE kind='consume' AND email=$1",[actor])).rows[0];
 const beforeLedger=await ledger(),beforePosts=input.posts();
 const config={modelId:'video-process',mode:'text',prompt:'AGENT_PROCESS original prompt',parameters:{durationSeconds:1,resolution:'4K'}};
 const image=[{id:'agent-image',nodeId:'process-input',kind:'image',role:'reference',value:'untrusted-client-display.png'}];
 const source=[{id:'agent-source',nodeId:input.sourceArtworkId,kind:'video',role:'source_video',value:'untrusted-client-display.mp4'}];
 const invoke=async(name:string,tool:string,args:Record<string,unknown>,sessionId='ag-'+randomUUID())=>{const marker=peer.register({name,tool,args}),result=await http('/api/agent',{sessionId,message:'执行本次视频操作，保留给定素材与参数。 '+marker});replies.push({name,sessionId,...result});assert.equal(result.status,200,JSON.stringify(result.value));assert(!result.value.error,JSON.stringify(result.value));assert.equal(result.value.sessionId,sessionId);return {sessionId,value:result.value};};
 const byOperation=async(operation:string)=>(await pool.query('SELECT * FROM app_video_tasks WHERE email=$1 AND idempotency_key=$2',[actor,operation])).rows[0];
 try{
  for(const [name,tool,inputs,intent]of [['generic-image','generate_video',image,'single_image'],['source-edit','edit_video',source,'reference'],['source-extend','extend_video',source,'reference']] as const){
   const operation=randomUUID(),before=input.posts(),reply=await invoke(name,tool,{config,inputs,operation_id:operation});
   const task=await byOperation(operation);assert(task,JSON.stringify(reply.value));tasks.push(task.id);const plan=await input.readPlan(task.id);
   assert.equal(task.parameters.version,3);assert.equal(task.parameters.submissionState,'prepared');assert.equal(plan.intent,intent);assert.equal(plan.requestedParameters.resolution,'4K');assert.equal(plan.effectiveParameters.resolution,'2K');assert.equal(task.billing_quote.requestedCredits,17);assert.equal(input.posts(),before);assert(reply.value.steps.some((step:any)=>step.tool===tool||step.name===tool),JSON.stringify(reply.value));
   pass(name+'-actual-agent-harness-billing-and-internal-http-accept-v3');
   // Original operation across another real model turn, with no new task.
   const countBefore=Number((await pool.query('SELECT count(*) n FROM app_video_tasks')).rows[0].n);
   await invoke(name+'-replay',tool,{config,inputs,operation_id:operation},reply.sessionId);assert.equal((await byOperation(operation)).id,task.id);assert.equal(Number((await pool.query('SELECT count(*) n FROM app_video_tasks')).rows[0].n),countBefore);assert.equal(input.posts(),before);
   await input.resume();const done=await input.until('Agent actual Worker completes '+name,()=>input.task(task.id),row=>row?.status==='completed',120000);await input.drain();assert(done.artwork_id);assert.equal(input.posts(),before+1);assert.equal((await pool.query('SELECT count(*)::int n FROM app_ledger WHERE id=$1',['led-video-'+task.id])).rows[0].n,1);
   if(intent==='reference')assert.equal((await pool.query('SELECT parent_id FROM app_artworks WHERE id=$1',[done.artwork_id])).rows[0].parent_id,input.sourceArtworkId);
  }
  pass('actual-agent-replay-keeps-original-task-and-one-ledger-per-worker-result');
  const beforeCount=Number((await pool.query('SELECT count(*) n FROM app_video_tasks')).rows[0].n),beforeReject=input.posts();
  for(const [name,tool,args]of [
   ['missing-source','edit_video',{config,inputs:[],operation_id:randomUUID()}],
   ['explicit-text-with-media','extend_video',{config:{...config,intentPreference:'text'},inputs:source,operation_id:randomUUID()}],
   ['unmapped-parameter','generate_video',{config:{...config,parameters:{...config.parameters,unmapped:1}},inputs:image,operation_id:randomUUID()}],
  ] as const){await invoke(name,tool,args);assert.equal(Number((await pool.query('SELECT count(*) n FROM app_video_tasks')).rows[0].n),beforeCount);assert.equal(input.posts(),beforeReject);}
  pass('actual-agent-invalid-intent-source-or-mapping-has-zero-task-and-post');
  assert.equal((await http('/api/agent?sessionId='+replies[0].sessionId,undefined,input.otherCookie)).status,404);
  const histories=(await pool.query('SELECT id,messages,steps FROM app_agent_sessions WHERE email=$1 AND id=ANY($2::text[])',[actor,[...new Set(replies.map(reply=>reply.sessionId))]])).rows;assert(histories.length>=6);assert(histories.every(row=>row.steps.some((step:any)=>step.type==='harness'&&step.code==='TOOL_ACCEPTED')||row.steps.some((step:any)=>step.type==='tool_end')));
  assert(peer.calls.length>=18);assert(peer.calls.every(call=>call.authorization==='Bearer '+input.credential));assert(replies.find(reply=>reply.name==='missing-source').value.steps.some((step:any)=>step.code==='SOURCE_VIDEO_REQUIRED'));assert(replies.find(reply=>reply.name==='unmapped-parameter').value.steps.some((step:any)=>step.code==='PARAMETER_MAPPING_MISSING'));
  pass('managed-text-sse-tools-persisted-session-and-owner-isolation');
  const after=await ledger(),added={n:after.n-beforeLedger.n,amount:after.amount-beforeLedger.amount};assert.deepEqual(added,{n:3,amount:51});assert.equal(input.posts()-beforePosts,3);
  await writeFile(path.join(input.outputDir,'AGENT_PROCESS_RESULT.json'),JSON.stringify({ok:true,checks,tasks,replies,modelCalls:peer.calls,ledgerAdded:added,actualAgentRoute:true,actualRuntimeHarness:true,actualInternalHttp:true,actualIndependentWorker:true,scriptedModelPeer:true,directToolCalls:0,directRouteCalls:0,paidCalls:0,productionWrites:0},null,2));
  console.log(`VIDEO_COMPILER_AGENT_PROCESS=PASS CHECKS=${checks.length} REAL_AGENT_HTTP=1 REAL_HARNESS=1 REAL_INTERNAL_HTTP=1 REAL_INDEPENDENT_WORKER=1 DIRECT_TOOL_CALLS=0 SUPPLIER_POSTS_ADDED=3 LEDGER_ADDED=51 PAID_CALLS=0 PRODUCTION_WRITES=0`);return added;
 }catch(error){await writeFile(path.join(input.outputDir,'AGENT_PROCESS_FAILURE.json'),JSON.stringify({checks,tasks,replies,modelCalls:peer.calls,error:String(error)},null,2));throw error;}
}
