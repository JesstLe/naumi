import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import type {Pool} from 'pg';
import type {VideoTaskRow} from '../src/lib/video/task-types';
import type {createModelFixture} from './model-config-fixture';
import {videoExecutionReadiness} from '../src/lib/model-config/video-execution-readiness';
import {Session} from 'node:inspector';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

async function beginGateCoverage(){
 const session=new Session();session.connect();
 const post=(name:string)=>new Promise<any>((resolve,reject)=>session.post(name as any,(error,result)=>error?reject(error):resolve(result)));
 await post('Profiler.enable');await new Promise<void>((resolve,reject)=>session.post('Profiler.startPreciseCoverage',{callCount:true,detailed:true},error=>error?reject(error):resolve()));
 // V8 can omit an entirely uncalled script. Calibrate with the real historical
 // function, then reset its counters before measuring only new acceptance.
 const {resolveVideoCapability}=await import('../src/lib/video/contract');resolveVideoCapability({manual:{modes:['text']}});
 const calibration=await post('Profiler.takePreciseCoverage');
 assert(calibration.result.some((script:any)=>script.functions.some((fn:any)=>fn.functionName==='resolveVideoCapability'&&fn.ranges[0].count>0)),'coverage positive control');
 return async()=>{try{const coverage=await post('Profiler.takePreciseCoverage');return coverage.result.flatMap((script:any)=>script.functions.filter((fn:any)=>['normalizeVideoInput','resolveVideoCapability','adapterDefinition','fallbackCapability','createLegacyWorkflowVideo','buildVideoCreate'].includes(fn.functionName)).map((fn:any)=>({url:script.url,name:fn.functionName,calls:fn.ranges[0].count})));}finally{await post('Profiler.stopPreciseCoverage');session.disconnect();}};
}
export async function verifyServerExit(input:{actor:string;pool:Pool;f:Awaited<ReturnType<typeof createModelFixture>>;posts:()=>number;task:(id:string)=>Promise<VideoTaskRow>;dispatch:(task:VideoTaskRow)=>Promise<void>;finish:(id:string)=>Promise<VideoTaskRow>;check:(name:string,fn:()=>void)=>void}){
 const {actor,pool,f,task}=input;let cases=0;const check=(name:string,fn:()=>void)=>{input.check('server-exit-'+name,fn);cases++;};
 const {withFrozenCreation}=await import('../src/lib/saas/creation-scope'),{createVideoGeneration}=await import('../src/lib/video/creation'),{freezeVideoWorkflow,withFrozenWorkflowStage}=await import('../src/lib/video/workflow-freeze'),{runOwnedLegacyWorkflowStage}=await import('../src/lib/video/legacy-workflow-creation');
 const {encryptAtRest}=await import('../src/lib/settings'),{getModelExecutor}=await import('../src/lib/model-config/execution'),{getBillingRuntime}=await import('../src/lib/billing/runtime'),{requestFromQueuedTask}=await import('../src/lib/video/runtime');
 const {GET:health}=await import('../src/app/api/health/route'),{GET:catalog}=await import('../src/app/api/video/catalog/route');
 const {createLegacyWorkflowVideo}=await import('../src/lib/video/legacy-workflow-submission'),{resumeVideoWorkflow}=await import('../src/lib/video/workflow');
 const original=await f.repo.current(),scoped=<T>(run:()=>Promise<T>)=>withFrozenCreation({actorEmail:actor,scopeKind:'personal',tenantId:null},run);
 const publish=async(config:typeof f.config)=>{const now=await f.repo.current(),d=await f.repo.draft('fixture-admin'),saved=await f.repo.saveDraft({id:d.id,expectedRevision:d.revision,actor:'fixture-admin',config}),p=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:now.version,actor:'fixture-admin',reason:'server compiler cutover fixture'});return f.repo.markApplied(p.id,p.digest,saved.id);};
 const count=async(table:string)=>Number((await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n);
 const legacy=structuredClone(original.config);legacy.providers[0].options={videoProfile:'apimart-apib-seedance',idempotencyStrategy:'header'};legacy.upstreamModels[0].model='seedance-1-0-pro-fast';legacy.upstreamModels[0].parameterMap={videoProfile:'apimart-apib-seedance'};legacy.upstreamModels[0].capabilities.generate=false;legacy.upstreamModels[0].capabilities.video={modes:['text'],limits:{images:0,videos:0,audios:0},durationResolutionMap:[{durations:[4],resolutions:['480p']}],defaultDurationSeconds:4,defaultResolution:'480p',defaultAspectRatio:'16:9',aspectRatios:['16:9']};
 await (await import('../src/lib/video/storage-schema')).ensureVideoWorkflowSchema();
 const environment:Record<string,string|undefined>={};for(const key of ['NAUMI_RELEASE_RUNTIME','NAUMI_INSTANCE_ID','SOURCE_COMMIT','NAUMI_RELEASE_ADMISSION_START','RELEASE_CONTROL_SECRET'])environment[key]=process.env[key];
 const identitySymbol=Symbol.for('naumi.release.agent-process-registry.v1'),host=process as typeof process&Record<symbol,unknown>,previousRegistry=host[identitySymbol];
 try{
  const flexible=structuredClone(original.config),binding=flexible.upstreamModels[0].parameterMap.videoExecution!;
  assert.equal(binding.profileId,'json-video');binding.recipe.parameters.durationSeconds={type:'number',minimum:0.1,maximum:10,default:1,wireField:'duration'};
  await publish(flexible);
  const finishGateCoverage=await beginGateCoverage();
  const fractional={source:'workbench' as const,modelId:'video-fixture',prompt:'Fractional duration',seconds:'1.5',size:'4K',durationSeconds:1.5,idempotencyKey:randomUUID()};
  const fractionalReceipt=await scoped(()=>createVideoGeneration(actor,fractional));
  const {readTaskCompiledVideoPlan}=await import('../src/lib/video/compiled-task');
  const fractionalTask=await task(fractionalReceipt.taskId);
  check('fractional-top-level-duration-reaches-published-compiler',()=>assert.equal(readTaskCompiledVideoPlan(actor,fractionalTask).billingFacts.durationSeconds,1.5));
  const {saveVideoNode}=await import('../src/lib/canvas/video-node-service');
  const draftNode=await scoped(()=>saveVideoNode(actor,{id:'fractional-draft',expectedRevision:0,operationId:randomUUID(),config:{modelId:'video-fixture',prompt:'Fractional draft',durationSeconds:1.5}}));
  const {workflowVideoRequestSchema}=await import('../src/lib/video/workflow-schema');
  check('canvas-and-workflow-keep-fractional-draft-value',()=>{assert.equal(draftNode.config.durationSeconds,1.5);assert.equal(workflowVideoRequestSchema.parse({prompt:'Fractional workflow',durationSeconds:1.5}).durationSeconds,1.5);});
  const invalidCount=await count('app_video_tasks'),invalidPosts=input.posts();
  await assert.rejects(()=>scoped(()=>createVideoGeneration(actor,{...fractional,durationSeconds:-2,idempotencyKey:randomUUID()})),{code:'PARAMETER_VALUE_INVALID'});
  check('actual-published-parameter-constraint-remains-without-new-task',()=>assert.equal(input.posts(),invalidPosts));
  assert.equal(await count('app_video_tasks'),invalidCount);
  await scoped(()=>freezeVideoWorkflow(actor,{id:randomUUID(),projectKey:'tree:fractional-draft',nodes:[{id:'compiled-stage',dependsOn:[],request:{modelId:'video-fixture',prompt:'Fractional stage',durationSeconds:1.5}}]}));
  const gateCoverage=await finishGateCoverage();
  check('actual-v8-new-create-and-freeze-old-gate-call-count-zero',()=>assert.deepEqual(gateCoverage.filter((row:any)=>row.calls>0),[]));
  console.log('NEW_TASK_GATE_COVERAGE='+JSON.stringify(gateCoverage));
  for(const file of ['src/lib/video/submission.ts','src/lib/video/workflow-freeze.ts']){
   const ast=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true),calls:string[]=[];
   function walk(node:ts.Node){if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&['normalizeVideoInput','resolveVideoCapability','adapterDefinition','fallbackCapability','buildVideoCreate'].includes(node.expression.text))calls.push(node.expression.text);ts.forEachChild(node,walk);}walk(ast);assert.deepEqual(calls,[]);
  }
  await input.dispatch(fractionalTask);await input.finish(fractionalTask.id);
  await publish(original.config);
  const old=await publish(legacy),before=input.posts(),tasks=await count('app_video_tasks'),reservations=await count('app_gen_reservations');
  const base={source:'workbench' as const,modelId:'video-fixture',prompt:'Unbound ordinary picture',seconds:'4',size:'480p',references:[{id:'ordinary',kind:'image' as const,role:'reference' as const,artworkId:'input-art'}]};
  await assert.rejects(()=>scoped(()=>createVideoGeneration(actor,{...base,idempotencyKey:randomUUID()})),{code:'VIDEO_EXECUTION_NOT_CONFIGURED'});
  await assert.rejects(()=>scoped(()=>freezeVideoWorkflow(actor,{id:randomUUID(),projectKey:'tree:legacy',nodes:[{id:'stage',dependsOn:[],request:base}]})),{code:'VIDEO_EXECUTION_NOT_CONFIGURED'});
  check('unbound-new-request-and-workflow-zero-old-gate-or-side-effects',()=>{assert.equal(input.posts(),before);});assert.equal(await count('app_video_tasks'),tasks);assert.equal(await count('app_gen_reservations'),reservations);
  // Exercise the real saved Canvas entry after its channel loses the binding.
  // Empty expansion is a harmless positive control for V8; reset it before
  // observing the entry. Missing mapping must not invoke old graph assembly.
  const {submitCanvasVideo}=await import('../src/lib/video/node-submission'),{resolveCanvasNodeInputs}=await import('../src/lib/canvas/node-inputs');
  const canvasCoverage=new Session();canvasCoverage.connect();
  const canvasPost=(name:string,params:Record<string,unknown>={})=>new Promise<any>((resolve,reject)=>canvasCoverage.post(name as any,params,(error,result)=>error?reject(error):resolve(result)));
  const canvasTables=['app_video_tasks','app_gen_reservations','app_creation_records','app_billing_operations','app_ledger'];
  const canvasCounts=await Promise.all(canvasTables.map(count));
  const inputFunctionCounts=(result:any)=>result.result.filter((s:any)=>s.url.replaceAll('\\','/').endsWith('/src/lib/canvas/node-inputs.ts')).flatMap((s:any)=>s.functions.filter((fn:any)=>fn.functionName==='resolveCanvasNodeInputs').map((fn:any)=>fn.ranges[0].count));
  let oldInputCalls=0;
  try{
   await canvasPost('Profiler.enable');await canvasPost('Profiler.startPreciseCoverage',{callCount:true,detailed:true});
   await resolveCanvasNodeInputs(actor,[],'coverage calibration');
   const calibrated=await canvasPost('Profiler.takePreciseCoverage');
   assert(inputFunctionCounts(calibrated).some((n:number)=>n>0),'Canvas coverage positive control');
   await assert.rejects(()=>scoped(()=>submitCanvasVideo(actor,{nodeId:draftNode.id,expectedRevision:draftNode.revision,idempotencyKey:randomUUID()})),{code:'VIDEO_EXECUTION_NOT_CONFIGURED'});
   const measured=await canvasPost('Profiler.takePreciseCoverage');
   console.log('CANVAS_INPUT_COVERAGE_RAW='+JSON.stringify(measured.result.filter((s:any)=>s.url.replaceAll('\\','/').endsWith('/src/lib/canvas/node-inputs.ts')).map((s:any)=>({url:s.url,functions:s.functions.filter((fn:any)=>fn.functionName==='resolveCanvasNodeInputs')}))));
   oldInputCalls=inputFunctionCounts(measured).reduce((a:number,b:number)=>a+b,0);
  }finally{await canvasPost('Profiler.stopPreciseCoverage');canvasCoverage.disconnect();}
  const canvasBaseline=process.argv.includes('--canvas-submit-owner-baseline');
  // V8/tsx reports both export accessors and async continuation entries under
  // this symbol. Positive execution vs zero reachability is the assertion;
  // these hits are not a count of business requests or supplier calls.
  check('unbound-canvas-single-input-owner',()=>{if(canvasBaseline)assert(oldInputCalls>0);else assert.equal(oldInputCalls,0);});
  check('unbound-canvas-zero-task-billing-or-provider-increment',()=>{assert.equal(input.posts(),before);});
  assert.deepEqual(await Promise.all(canvasTables.map(count)),canvasCounts);
  console.log('CANVAS_SUBMIT_OWNER_PG='+(canvasBaseline?'BASELINE':'PASS')+' OLD_INPUT_V8_HITS='+oldInputCalls+' BUSINESS_TABLES_UNCHANGED=5 PROVIDER_POSTS_ADDED=0');
  const readiness=videoExecutionReadiness(old);check('enabled-unbound-channel-reported-even-generate-false',()=>{assert.equal(readiness.ready,false);assert(readiness.issues.some(row=>row.code==='VIDEO_EXECUTION_NOT_CONFIGURED'));assert(!JSON.stringify(readiness).includes(f.marker));});
  const healthOld=await health(),healthBody=await healthOld.json();check('candidate-health-not-ready-without-public-model-or-secret-leak',()=>{assert.equal(healthOld.status,503);assert.equal(healthBody.videoExecution.ready,false);assert(!JSON.stringify(healthBody).includes('seedance'));assert(!JSON.stringify(healthBody).includes(f.marker));});
  const cat=await catalog(),list=await cat.json();check('unbound-catalog-keeps-identity-without-invented-capability',()=>{assert.equal(cat.status,200);const row=list.models.find((m:any)=>m.modelId==='video-fixture');assert(row);assert.equal(row.executionStatus,'mapping_required');assert.equal(row.definition,undefined);assert.equal(row.modes,undefined);});
  // Accepted stages get their legacy lane only after reading the actual owned
  // encrypted row. A caller-created stage object alone is insufficient.
  const billing=await(await getBillingRuntime()).config.current(),executor=await getModelExecutor(),frozen=await executor.resolve({feature:'video.generate',binding:'video.generate',requestedModelId:'video-fixture',snapshot:old,billing});
  // Mint the immutable old capability snapshot exactly as the pre-cutover
  // producer did; new resolve intentionally does not read legacy metadata.
  frozen.video=await (await import('../src/lib/video/frozen-capability')).freezeManagedVideoCapability(old,old.config.upstreamModels[0],old.config.providers[0],pool);
  const stage={bundle:{modelVersion:old.version,billingVersion:billing.version,primary:'video' as const,video:frozen},billingVersion:billing.version,texts:{},quote:{version:billing.version,credits:0,authorizedCredits:0}},runId=randomUUID(),nodeId='old-stage';
  const historical={source:'workflow' as const,sourceId:runId,workflowRunId:runId,workflowNodeId:nodeId,modelId:'video-fixture',prompt:'Original accepted stage',mode:'text' as const,seconds:'4',size:'480p',durationSeconds:4,resolution:'480p',aspectRatio:'16:9',references:[],idempotencyKey:randomUUID()};
  const plan={id:runId,projectKey:'tree:legacy',nodes:[{id:nodeId,dependsOn:[],request:{modelId:'video-fixture',prompt:historical.prompt}}]};
  await pool.query('INSERT INTO app_video_workflow_runs(id,email,project_key,plan,plan_digest,frozen_nodes_enc,execution_version) VALUES($1,$2,$3,$4,$5,$6,0)',[runId,actor,'tree:legacy',JSON.stringify(plan),'historical-fixture',encryptAtRest(JSON.stringify({[nodeId]:stage}))]);await pool.query('INSERT INTO app_video_workflow_run_nodes(run_id,node_id,status) VALUES($1,$2,\'pending\')',[runId,nodeId]);
  const hooks={submit:async()=>{},creationError:async()=>{throw Error('Unexpected old submission error');}};
  await assert.rejects(()=>scoped(()=>createLegacyWorkflowVideo(actor,historical,hooks)),{code:'WORKFLOW_SNAPSHOT_UNAVAILABLE'});
  await assert.rejects(()=>scoped(()=>withFrozenWorkflowStage(actor,stage,async()=>true)),{code:'WORKFLOW_SNAPSHOT_UNAVAILABLE'});
  await assert.rejects(()=>scoped(()=>withFrozenWorkflowStage(actor,{...stage,texts:{injected:'text'}},async()=>true,undefined,{runId,nodeId})),{code:'WORKFLOW_SNAPSHOT_UNAVAILABLE'});
  await assert.rejects(()=>scoped(()=>runOwnedLegacyWorkflowStage('other@fixture.test',stage,{runId,nodeId},async()=>true)),{code:'WORKFLOW_SNAPSHOT_UNAVAILABLE'});
  await assert.rejects(()=>scoped(()=>withFrozenWorkflowStage(actor,stage,()=>createVideoGeneration(actor,{...historical,workflowRunId:randomUUID()}),undefined,{runId,nodeId})),{code:'WORKFLOW_SNAPSHOT_UNAVAILABLE'});
  check('fake-cross-owner-or-altered-legacy-stage-never-enters-old-acceptance',()=>assert.equal(input.posts(),before));assert.equal(await count('app_video_tasks'),tasks);
  const receipt=await scoped(()=>withFrozenWorkflowStage(actor,stage,()=>createVideoGeneration(actor,historical),undefined,{runId,nodeId})),accepted=await task(receipt.taskId),request=JSON.stringify(requestFromQueuedTask(accepted));
  check('actual-owned-accepted-legacy-stage-keeps-v2-and-frozen-request',()=>{assert.equal(accepted.parameters.version,2);assert.equal(accepted.parameters.workflowRunId,runId);});
  const oldUnfrozenId=randomUUID(),unfrozenInput={...historical,sourceId:oldUnfrozenId,workflowRunId:oldUnfrozenId,idempotencyKey:randomUUID()};
  await pool.query('INSERT INTO app_video_workflow_runs(id,email,project_key,plan,plan_digest,execution_version) VALUES($1,$2,$3,$4,$5,0)',[oldUnfrozenId,actor,'tree:legacy',JSON.stringify({...plan,id:oldUnfrozenId}),'pre-freeze-original']);await pool.query('INSERT INTO app_video_workflow_run_nodes(run_id,node_id,status) VALUES($1,$2,\'pending\')',[oldUnfrozenId,nodeId]);
  const unfrozenReceipt=await scoped(()=>runOwnedLegacyWorkflowStage(actor,undefined,{runId:oldUnfrozenId,nodeId},()=>createVideoGeneration(actor,unfrozenInput))),unfrozenTask=await task(unfrozenReceipt.taskId);check('actual-pre-freeze-owned-run-keeps-historical-acceptance',()=>assert.equal(unfrozenTask.parameters.version,2));
  await publish(original.config);await input.dispatch(unfrozenTask);await input.finish(unfrozenTask.id);await input.dispatch(accepted);const done=await input.finish(accepted.id);check('historical-v2-dispatch-after-new-publication-results-and-one-ledger',()=>{assert.equal(done.status,'completed',done.error);assert.equal(JSON.stringify(requestFromQueuedTask(done)),request);});assert.equal((await pool.query('SELECT count(*)::int n FROM app_ledger WHERE id=$1',[`led-video-${done.id}`])).rows[0].n,1);
  const replayPosts=input.posts(),replay=await scoped(()=>createVideoGeneration(actor,historical));check('accepted-receipt-before-latest-model-gate-and-no-repost',()=>{assert.equal(replay.taskId,done.id);assert.equal(input.posts(),replayPosts);});
  const missingId=randomUUID();await pool.query('INSERT INTO app_video_workflow_runs(id,email,project_key,plan,plan_digest,execution_version) VALUES($1,$2,$3,$4,$5,1)',[missingId,actor,'tree:legacy',JSON.stringify({...plan,id:missingId}),'new-missing-snapshot']);
  process.env.NAUMI_WORKER_EXECUTION='direct';try{await assert.rejects(()=>scoped(()=>resumeVideoWorkflow(missingId,actor)),{code:'WORKFLOW_SNAPSHOT_UNAVAILABLE'});}finally{delete process.env.NAUMI_WORKER_EXECUTION;}await assert.rejects(()=>scoped(()=>runOwnedLegacyWorkflowStage(actor,undefined,{runId:missingId,nodeId},async()=>true)),{code:'WORKFLOW_SNAPSHOT_UNAVAILABLE'});check('new-workflow-missing-snapshot-cannot-pose-as-old-unfrozen',()=>assert.equal(input.posts(),replayPosts));
  // Cutover health and controlled resume share the actual published snapshot.
  delete host[identitySymbol];Object.assign(process.env,{NAUMI_RELEASE_RUNTIME:'1',NAUMI_INSTANCE_ID:'fixture-'+randomUUID(),SOURCE_COMMIT:'f'.repeat(40),NAUMI_RELEASE_ADMISSION_START:'draining',RELEASE_CONTROL_SECRET:'fixture-release-video-migration-0123456789abcdef'});
  const {releaseIdentity}=await import('../src/lib/release-runtime/identity'),{POST:control}=await import('../src/app/api/internal/release/control/route');const identity=releaseIdentity(),body={instanceId:identity.instanceId,bootId:identity.bootId,expectedRevision:1,operationId:randomUUID(),action:'resume'};
  const call=()=>control(new Request('http://fixture/api/internal/release/control',{method:'POST',headers:{'content-type':'application/json','x-release-control-secret':process.env.RELEASE_CONTROL_SECRET!},body:JSON.stringify(body)}));
  await publish(legacy);const blocked=await call(),blockedBody=await blocked.clone().json();check('release-resume-blocked-before-config-migration',()=>assert.equal(blocked.status,503,JSON.stringify(blockedBody)));assert.equal(await count('app_release_controls'),0);
  await publish(original.config);const ready=await health();check('reviewed-binding-published-candidate-health-ready',()=>assert.equal(ready.status,200));const opened=await call();const openedBody=await opened.json();check('same-original-resume-op-after-migration-opens-once',()=>{assert.equal(opened.status,200,JSON.stringify(openedBody));assert.equal(openedBody.admission.revision,2);});assert.equal(await count('app_release_controls'),1);
  await publish(legacy);const repeated=await call();check('resume-receipt-replay-does-not-reapply-or-fail-on-latest-config',()=>assert.equal(repeated.status,200));assert.equal(await count('app_release_controls'),1);
  const preserved=await f.repo.byVersion(old.version);check('old-published-versions-remain-immutable',()=>assert.deepEqual(preserved.config,old.config));
  console.log('VIDEO_SERVER_EXIT=PASS CASES='+cases+' REAL_PG=true REAL_ROUTE=true OLD_STAGE_V2=RECOVERED NEW_TASK_OLD_GATE=0 RELEASE_MIGRATION_GUARD=true PAID_CALLS=0');
 }finally{await publish(original.config);for(const [key,value]of Object.entries(environment)){if(value===undefined)delete process.env[key];else process.env[key]=value;}if(previousRegistry===undefined)delete host[identitySymbol];else host[identitySymbol]=previousRegistry;const {releasePool}=await import('../src/lib/release-runtime/store');await releasePool().end();}
}
