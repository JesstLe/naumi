import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {VideoTaskRow} from '../src/lib/video/task-types';
import type {createModelFixture} from './model-config-fixture';
export async function verifyCompiledByoc(input:{actor:string;pool:Pool;f:Awaited<ReturnType<typeof createModelFixture>>;byoc:{posts:number;uploads:number;objects:number;mode:string;received:any[];uploadHashes:string[]};key:string;
 finish:(id:string)=>Promise<VideoTaskRow>;task:(id:string)=>Promise<VideoTaskRow>;dispatch:(task:VideoTaskRow)=>Promise<void>;check:(name:string,run:()=>void)=>void}){
 const {actor,pool,f,task,finish,dispatch,byoc}=input;
 const {withFrozenCreation}=await import('../src/lib/saas/creation-scope');
 const {submitByocComfyVideo,retryByocVideoTask}=await import('../src/lib/video/byoc');
 const {getVideoNode}=await import('../src/lib/canvas/video-node-repository');
 const {saveVideoNode}=await import('../src/lib/canvas/video-node-service');
 const {saveComfyWorkflow,saveComfyEndpoint}=await import('../src/lib/comfyui/repository');
 const {withByocVideoTask}=await import('../src/lib/video/byoc-context');
 const {readTaskCompiledVideoPlan}=await import('../src/lib/video/compiled-task');
 const {requestVideoCancellation}=await import('../src/lib/video/cancellation');
 const {publicVideoTaskSnapshot}=await import('../src/lib/video/task-snapshot');
 const {POST:comfyRun}=await import('../src/app/api/comfyui/run/route');
 const {signUserSession,USER_COOKIE}=await import('../src/lib/native-auth');
 const {createVideoGeneration}=await import('../src/lib/video/creation');
 const {freezeVideoWorkflow}=await import('../src/lib/video/workflow-freeze');
 const {validateVideoWorkflow,scheduleVideoWorkflow,resumeVideoWorkflow}=await import('../src/lib/video/workflow');
 const {closeVideoCoordinationPool}=await import('../src/lib/video/coordination-pool');
 const creation={actorEmail:actor,scopeKind:'personal' as const,tenantId:null},scoped=<T>(run:()=>Promise<T>)=>withFrozenCreation({...creation},run);
 let cases=0;const check=(name:string,run:()=>void)=>{input.check('byoc-'+name,run);cases++;};
 const api={'load':{class_type:'LoadImage',inputs:{image:'old.png'}},'text':{class_type:'CLIPTextEncode',inputs:{text:'old prompt'}},'save':{class_type:'SaveVideo',inputs:{images:['load',0],text:['text',0],fps:24}}};
 const workflowId='byoc-compiled-owned';
 const saved=await saveComfyWorkflow(actor,{newId:workflowId,name:'Owned workflow',apiJson:api,inputs:{},required:[]});assert(saved.some(w=>w.id===workflowId));
 const base={workflowId,mediaType:'video' as const,source:'workbench' as const,prompt:'Actual workflow action',references:[{id:'byoc-image',kind:'image' as const,role:'reference' as const,artworkId:'input-art'}]};
 const submit=(patch:Record<string,unknown>={})=>scoped(()=>submitByocComfyVideo(actor,{...structuredClone(base),idempotencyKey:randomUUID(),...patch}));
 const direct=async<T>(run:()=>Promise<T>)=>{process.env.NAUMI_WORKER_EXECUTION='direct';try{return await run();}finally{delete process.env.NAUMI_WORKER_EXECUTION;}};
 const ownedDispatch=(t:VideoTaskRow)=>direct(()=>scoped(()=>withByocVideoTask(actor,t,async()=>{const {submitQueuedVideoTask}=await import('../src/lib/video/runtime');await submitQueuedVideoTask(actor,t);})));

 const count=async(table:string)=>Number((await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n);
 const original=await f.repo.current();
 const publish=async(config:typeof f.config)=>{const current=await f.repo.current(),draft=await f.repo.draft('fixture-admin'),saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,actor:'fixture-admin',config}),publication=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor:'fixture-admin',reason:'BYOC/workflow local fixture'});return f.repo.markApplied(publication.id,publication.digest,saved.id);};
 try{
  const before=await count('app_video_tasks');await assert.rejects(()=>submit(),{code:'BYOC_ENDPOINT_REQUIRED'});check('library-saved-without-endpoint-execution-accurate-prerequisite',()=>{assert.equal(byoc.posts,0);assert.equal(byoc.uploads,0);});assert.equal(await count('app_video_tasks'),before);
  await saveComfyEndpoint(actor,{name:'Local own fixture',baseUrl:f.origin,apiKey:'fixture-comfy-owned-secret',activate:true});
  await assert.rejects(()=>scoped(()=>submitByocComfyVideo('foreign@fixture.test',{...base,idempotencyKey:randomUUID()})),{code:'VIDEO_SCOPE_MISMATCH'});
  const {previewVideoExecution}=await import('../src/lib/video/compile-preview');
  const previewCounts=await Promise.all(['app_video_tasks','app_gen_reservations','app_creation_records','app_model_credentials'].map(count)),networkBefore=[byoc.posts,byoc.uploads,byoc.objects];
  const preview=await scoped(()=>previewVideoExecution(actor,{byoc:{...base,draftRevision:7}}));assert(preview.ok,JSON.stringify(preview));
  assert.deepEqual(await Promise.all(['app_video_tasks','app_gen_reservations','app_creation_records','app_model_credentials'].map(count)),previewCounts);assert.deepEqual([byoc.posts,byoc.uploads,byoc.objects],networkBefore);
  check('byoc-preview-same-compiler-zero-upload-endpoint-or-credential-write',()=>assert.equal(preview.value.intent,'workflow'));
  const receipt=await submit(),queued=await task(receipt.taskId),plan=readTaskCompiledVideoPlan(actor,queued);
  check('byoc-durable-zero-uses-common-compiled-plan',()=>{assert.equal(receipt.cost,0);assert.equal(queued.parameters.version,3);assert.equal(plan.intent,'workflow');assert.equal(plan.digest,preview.value.planDigest);assert.equal(plan.billingFacts.durationSeconds,-1);assert.equal(plan.binding.profileId,'workflow-video');assert.equal(byoc.posts,0);assert.equal(byoc.uploads,0);});
  assert(!('request' in queued.parameters));assert(!JSON.stringify(queued.parameters).includes('fixture-comfy-owned-secret'));
  const sameKey=queued.idempotencyKey!;await pool.query('UPDATE app_comfyui_endpoints SET is_active=false WHERE email=$1',[actor]);const replay=await scoped(()=>submitByocComfyVideo(actor,{...base,idempotencyKey:sameKey}));assert.equal(replay.taskId,queued.id);
  const cookie=`${USER_COOKIE}=${signUserSession(actor,Date.now())}`;
  const response=await comfyRun(new Request('http://127.0.0.1/api/comfyui/run',{method:'POST',headers:{cookie,origin:'http://127.0.0.1','content-type':'application/json'},body:JSON.stringify({...base,idempotencyKey:sameKey,mediaType:'video'})}));
  assert.equal(response.status,202,await response.clone().text());assert.equal((await response.json()).taskId,queued.id);
  check('accepted-receipt-survives-endpoint-deactivation',()=>assert.equal(replay.taskId,queued.id));
  await pool.query('UPDATE app_comfyui_workflows SET api_json=$2::jsonb WHERE id=$1',[workflowId,JSON.stringify({...api,text:{...api.text,inputs:{text:'Changed after acceptance'}}})]);
  await ownedDispatch(queued);check('frozen-dag-byte-upload-and-context-materialization',()=>{assert.equal(byoc.posts,1);assert.equal(byoc.uploads,1);const body=byoc.received.at(-1).body;assert.equal(body.client_id,queued.idempotencyKey);assert.equal(body.prompt.text.inputs.text,'Actual workflow action');assert.match(body.prompt.load.inputs.image,/^uploads\/naumi-[a-f0-9]{64}\.png$/);assert.deepEqual(body.prompt.save.inputs.images,['load',0]);const i=plan.inputManifest.find(i=>i.kind==='image');assert(i&&i.kind!=='text');assert.equal(byoc.uploadHashes.at(-1),i.asset.sha256);});
  const done=await finish(queued.id);check('real-byoc-output-and-zero-ledger-settlement',()=>assert.equal(done.status,'completed',done.error));assert.equal((await pool.query('SELECT count(*)::int n FROM app_ledger WHERE id=$1',[`led-video-${queued.id}`])).rows[0].n,0);
  const snap=publicVideoTaskSnapshot(done);check('byoc-history-settings-and-asset-inputs-preserved',()=>{assert.equal(snap.byoc,true);assert.equal(snap.config.comfyWorkflowId,workflowId);assert.equal(snap.inputs[0].nodeId,'input-art');});
  await pool.query('UPDATE app_comfyui_endpoints SET is_active=true WHERE email=$1',[actor]);
  const routeBody={...base,idempotencyKey:randomUUID(),mediaType:'video'};const route=await comfyRun(new Request('http://127.0.0.1/api/comfyui/run',{method:'POST',headers:{cookie,origin:'http://127.0.0.1','content-type':'application/json'},body:JSON.stringify(routeBody)})),payload=await route.json();assert.equal(route.status,202,JSON.stringify(payload));const routed=await task(payload.taskId);check('actual-comfy-run-route-produces-v3-plan',()=>assert.equal(routed.parameters.version,3));
  await scoped(()=>requestVideoCancellation(actor,routed.id));const postsBefore=byoc.posts;await ownedDispatch(await task(routed.id));check('cancelled-prepared-plan-never-submits-generation',()=>assert.equal(byoc.posts,postsBefore));
  const cancelledTask=await task(routed.id);const retry=await scoped(()=>retryByocVideoTask(actor,cancelledTask,randomUUID()));
  const retryTask=await task(retry.taskId);check('explicit-retry-frozen-owned-recipe-without-library-read',()=>assert.equal(readTaskCompiledVideoPlan(actor,retryTask).digest,readTaskCompiledVideoPlan(actor,cancelledTask).digest));
  await ownedDispatch(retryTask);await finish(retryTask.id);
  const unknown=await submit(),unknownTask=await task(unknown.taskId);byoc.mode='disconnect';try{await ownedDispatch(unknownTask);}catch(error){const {handleVideoCreationError}=await import('../src/lib/video/runtime');await handleVideoCreationError(actor,unknownTask,error);}byoc.mode='ok';const unknownSaved=await task(unknownTask.id);check('workflow-acceptance-unknown-retained',()=>assert.equal(unknownSaved.errorCode,'creation_unknown'));const unknownPosts=byoc.posts;await assert.rejects(()=>scoped(()=>retryByocVideoTask(actor,unknownSaved,randomUUID())),{code:'VIDEO_RETRY_NOT_ALLOWED'});assert.equal(byoc.posts,unknownPosts);
  const bad=await submit();byoc.mode='bad-upload';try{await ownedDispatch(await task(bad.taskId));}catch(error){const {handleVideoCreationError}=await import('../src/lib/video/runtime');await handleVideoCreationError(actor,await task(bad.taskId),error);}byoc.mode='ok';check('bad-upload-name-fails-before-generation',()=>assert.equal(byoc.posts,unknownPosts));
  await scoped(()=>saveVideoNode(actor,{id:'byoc-compiled',expectedRevision:0,operationId:randomUUID(),config:{comfyWorkflowId:workflowId,prompt:'Root'}}));
  const byocPlan=validateVideoWorkflow({id:randomUUID(),projectKey:'tree:byoc-compiled',nodes:[{id:'a',dependsOn:[],request:{comfyWorkflowId:workflowId,prompt:'Frozen BYOC stage',references:base.references}}]});const stages=await scoped(()=>freezeVideoWorkflow(actor,byocPlan));assert.equal(stages.a.compiled?.projected.intent,'workflow');await scoped(()=>scheduleVideoWorkflow(actor,byocPlan,undefined,stages));const run=await direct(()=>resumeVideoWorkflow(byocPlan.id,actor));assert(run.nodes[0].taskId,JSON.stringify(run));const wfTask=await task(run.nodes[0].taskId!);check('actual-workflow-byoc-stage-final-compiler-once',()=>assert.equal(wfTask.parameters.version,3));await finish(wfTask.id);
  const {prepareByocRecipe}=await import('../src/lib/video/byoc-recipe');const {withFrozenWorkflowStage}=await import('../src/lib/video/workflow-freeze');
  const oldRecipe=await scoped(()=>prepareByocRecipe(actor,{workflowId,prompt:'Historical stage',references:base.references}));
  const {getBillingRuntime}=await import('../src/lib/billing/runtime');const bill=await (await getBillingRuntime()).config.current();
  const legacyStage={byoc:oldRecipe,billingVersion:bill.version,texts:{},quote:{version:bill.version,credits:0,authorizedCredits:0}};
  const oldReceipt=await scoped(()=>withFrozenWorkflowStage(actor,legacyStage,()=>submitByocComfyVideo(actor,{...base,prompt:'Historical stage',idempotencyKey:randomUUID()}))),oldTask=await task(oldReceipt.taskId);
  check('accepted-historical-stage-retains-v2-reader-not-new-compile',()=>assert.equal(oldTask.parameters.version,2));await ownedDispatch(oldTask);await finish(oldTask.id);
  const {submitCanvasVideo}=await import('../src/lib/video/node-submission');const {previewCanvasVideo}=await import('../src/lib/video/node-preview');
  const node=await scoped(()=>saveVideoNode(actor,{id:'byoc-owned-node',expectedRevision:0,operationId:randomUUID(),config:{comfyWorkflowId:workflowId,prompt:'Node BYOC',parameters:{durationSeconds:1}},inputs:[{id:'node-image',nodeId:'input-art',kind:'image',role:'reference',value:'forged'}]}));
  const nodePreview=await scoped(()=>previewCanvasVideo(actor,node.id,{expectedRevision:node.revision,draftRevision:3}));assert(nodePreview.ok,JSON.stringify(nodePreview));
  const nodeReceipt=await scoped(()=>submitCanvasVideo(actor,{nodeId:node.id,expectedRevision:node.revision,idempotencyKey:randomUUID()})),nodeTask=await task(nodeReceipt.taskId);check('owned-canvas-byoc-preview-and-submission-share-plan',()=>{assert.equal(nodeTask.parameters.compiledPlanDigest,nodePreview.value.planDigest);assert.equal(nodeTask.parameters.nodeId,node.id);});await ownedDispatch(nodeTask);await finish(nodeTask.id);
  const {createCanvasVideoTools}=await import('../src/lib/agent/canvas-video-tools');const {validateToolArguments}=await import('../src/lib/agent/harness');const {GET:tasksRoute}=await import('../src/app/api/video/tasks/route');
  const tools=createCanvasVideoTools({actor,internal:async(path:string,_signal?:AbortSignal,init:RequestInit={})=>{
    const request=new Request('http://127.0.0.1'+path,{...init,headers:{cookie,origin:'http://127.0.0.1',...Object.fromEntries(new Headers(init.headers))}});
    const response=path.startsWith('/api/video/tasks?')?await tasksRoute(request):path==='/api/comfyui/run'?await comfyRun(request):(()=>{throw Error('unexpected Agent route '+path);})();const body=await response.json();if(!response.ok)throw Object.assign(Error(body.error),{status:response.status});return body;
  }});
  const generate=tools.find(t=>t.name==='generate_video')!,args={config:{comfyWorkflowId:workflowId,prompt:'Agent BYOC',parameters:{durationSeconds:1}},inputs:[{id:'agent-byoc-image',nodeId:'input-art',kind:'image',role:'reference',value:'ignored'}],operation_id:randomUUID()};validateToolArguments(generate.parameters,args);
  const agentResult=await scoped(async()=>(await generate.execute(randomUUID(),args)).details as any),agentTask=await task(agentResult.taskId);check('actual-agent-tool-uses-byoc-compiler-and-route',()=>assert.equal(agentTask.parameters.version,3));await ownedDispatch(agentTask);await finish(agentTask.id);
  // Every BYOC entry must pass the exact saved draft to the compiler. Missing
  // mappings may reject, but no entry may silently run a stripped request.
  const {videoByocDraft}=await import('../src/lib/video/byoc-draft');
  const invalidDrafts=[
    {name:'intent',change:{intentPreference:'single_image'},code:'WORKFLOW_MODE_CONFLICT'},
    {name:'shots',change:{shots:[{id:'shot',prompt:'Exact shot',durationSeconds:1}]},code:'WORKFLOW_STRUCTURE_NOT_MAPPED'},
    {name:'elements',change:{elements:[{id:'character',name:'Character',references:[{id:'nested-image',kind:'image',role:'element',artworkId:'input-art'}]}]},code:'WORKFLOW_STRUCTURE_NOT_MAPPED'},
    {name:'camera',change:{camera:{movement:'pan left'}},code:'PARAMETER_MAPPING_MISSING'},
    {name:'dimensions',change:{width:1024,height:768},code:'PARAMETER_MAPPING_MISSING'},
    {name:'provider-options',change:{providerOptions:{toggle:false}},code:'PARAMETER_MAPPING_MISSING'},
  ];
  const effects=async()=>Promise.all(['app_video_tasks','app_gen_reservations','app_creation_records','app_ledger'].map(count));
  const effectsBefore=await effects(),sendBefore=[byoc.posts,byoc.uploads];
  for(const variant of invalidDrafts){
    const config= (await import('../src/lib/canvas/video-node-schema')).videoNodeConfigSchema.parse({comfyWorkflowId:workflowId,prompt:'Exact BYOC draft',references:base.references,...variant.change});
    const preview=await scoped(()=>previewVideoExecution(actor,{byoc:{...videoByocDraft(config,[]),draftRevision:1}}));assert(!preview.ok);assert.equal(preview.diagnostics[0].code,variant.code,variant.name);
    await assert.rejects(()=>submit({...videoByocDraft(config,[])}),{code:variant.code});
    const args={config,inputs:[],operation_id:randomUUID()};validateToolArguments(generate.parameters,args);await assert.rejects(()=>scoped(()=>generate.execute(randomUUID(),args)),{code:variant.code});
    check('complete-standalone-and-agent-'+variant.name+'-not-silently-dropped',()=>{assert.deepEqual([byoc.posts,byoc.uploads],sendBefore);});
    const current=await getVideoNode(actor,node.id);assert(current);
    const edited=await scoped(()=>saveVideoNode(actor,{id:current.id,expectedRevision:current.revision,operationId:randomUUID(),config,inputs:[]}));
    const nodePreview=await scoped(()=>previewCanvasVideo(actor,edited.id,{expectedRevision:edited.revision,draftRevision:1}));assert(!nodePreview.ok);assert.equal(nodePreview.diagnostics[0].code,variant.code,variant.name);
    await assert.rejects(()=>scoped(()=>submitCanvasVideo(actor,{nodeId:edited.id,expectedRevision:edited.revision,idempotencyKey:randomUUID()})),{code:variant.code});
    check('saved-canvas-'+variant.name+'-preview-submit-agree',()=>assert.deepEqual([byoc.posts,byoc.uploads],sendBefore));
  }
  assert.deepEqual(await effects(),effectsBefore);
  check('all-invalid-ingress-has-zero-task-reservation-creation-ledger-and-generation',()=>assert.deepEqual([byoc.posts,byoc.uploads],sendBefore));
  const staticArgs={config:{comfyWorkflowId:workflowId,prompt:'Agent static reference',references:base.references},inputs:[],operation_id:randomUUID()};validateToolArguments(generate.parameters,staticArgs);
  const staticResult=await scoped(async()=>(await generate.execute(randomUUID(),staticArgs)).details as any),staticTask=await task(staticResult.taskId),staticPlan=readTaskCompiledVideoPlan(actor,staticTask);
  check('agent-empty-ordered-list-retains-config-reference',()=>{assert.equal(staticPlan.inputManifest.length,1);assert.equal(staticPlan.inputManifest[0].nodeId,'input-art');assert.equal(staticTask.parameters.version,3);});
  await ownedDispatch(staticTask);await finish(staticTask.id);
  const videoApi=structuredClone(api);(videoApi.save.inputs as Record<string,unknown>).source_video='old.mp4';await saveComfyWorkflow(actor,{id:workflowId,name:'Owned workflow',apiJson:videoApi,inputs:{},required:[]});
  const linked=validateVideoWorkflow({id:randomUUID(),projectKey:'tree:byoc-compiled',nodes:[{id:'completed-source',existingArtworkId:done.artworkId,dependsOn:[],request:{prompt:''}},{id:'future-byoc',dependsOn:['completed-source'],request:{comfyWorkflowId:workflowId,prompt:'Frozen linked BYOC',references:base.references,comfyInputs:[{name:'image-load',type:'image',path:['load','inputs','image'],required:true},{name:'source-video',type:'video',path:['save','inputs','source_video'],required:true}]},mediaBindings:[{fromNodeId:'completed-source',kind:'video',role:'source_video'}]}]});
  const linkedStages=await scoped(()=>freezeVideoWorkflow(actor,linked));assert.equal(linkedStages['future-byoc'].compiled!.state,'dependency_pending');assert(!linkedStages['future-byoc'].compiled!.staticDraft.inputs.some(i=>i.kind==='video'));
  await scoped(()=>scheduleVideoWorkflow(actor,linked,undefined,linkedStages));const linkedRun=await direct(()=>resumeVideoWorkflow(linked.id,actor)),linkedId=linkedRun.nodes.find(n=>n.id==='future-byoc')!.taskId;assert(linkedId,JSON.stringify(linkedRun));const linkedTask=await task(linkedId);check('byoc-real-future-output-input-uploaded-under-frozen-dag',()=>{assert.equal(linkedTask.parameters.version,3);const body=byoc.received.at(-1).body;assert.match(body.prompt.save.inputs.source_video,/^uploads\/naumi-[a-f0-9]{64}\.mp4$/);});await finish(linkedId);
  for(const runtime of ['comfyui','runninghub','autodl'] as const){
    const cfg=structuredClone(original.config);cfg.providers[0].protocol=runtime;cfg.providers[0].baseUrl=f.origin;cfg.providers[0].options={videoProfile:runtime,idempotencyStrategy:'none'};
    const workflowRecipe={manifest:{version:1 as const,kind:runtime,workflowId:'managed-workflow',template:structuredClone(api),inputs:[{name:'image',type:'image' as const,path:['load','inputs','image'],required:true},{name:'prompt',type:'prompt' as const,path:['text','inputs','text']}]},parameters:{durationSeconds:{type:'integer' as const,default:1},resolution:{type:'string' as const,default:'4K',mapping:{'4K':'2K'},send:'semantic' as const}},media:{image:runtime==='autodl'?{delivery:'url' as const}:{delivery:'upload' as const,path:runtime==='comfyui'?'/upload/image':'/task/openapi/upload',fileField:runtime==='comfyui'?'image':'file',namePath:runtime==='comfyui'?['name']:['data','fileName'],...(runtime==='comfyui'?{subfolderPath:['subfolder'],form:{} as Record<string,string>}:{form:{apiKey:'$credential',fileType:'input'}})}}};
    cfg.upstreamModels[0].parameterMap={videoExecution:{schemaVersion:1,profileId:'workflow-video',profileVersion:1,recipe:workflowRecipe}};
    await publish(cfg);
    const uploads=byoc.uploads,posts=byoc.posts;
    const receipt=await scoped(()=>createVideoGeneration(actor,{source:'workbench',modelId:'video-fixture',prompt:'Managed workflow text',seconds:'',size:'',parameters:{resolution:'4K'},references:base.references,idempotencyKey:randomUUID()})),managed=await task(receipt.taskId),mapped=readTaskCompiledVideoPlan(actor,managed);
    check('managed-'+runtime+'-published-profile-and-billing',()=>{assert.equal(mapped.intent,'workflow');assert.equal(mapped.requestedParameters.resolution,'4K');assert.equal(mapped.billingFacts.resolution,'2K');assert.equal(byoc.posts,posts);assert.equal(byoc.uploads,uploads);assert(managed.billingQuote);});
    await dispatch(managed);check('managed-'+runtime+'-actual-wire-materialization',()=>{assert.equal(byoc.posts,posts+1);assert.equal(byoc.uploads,uploads+(runtime==='autodl'?0:1));const body=byoc.received.at(-1).body;if(runtime==='comfyui')assert.equal(body.prompt.text.inputs.text,'Managed workflow text');if(runtime==='runninghub'){assert.equal(body.workflowId,'managed-workflow');assert.equal(typeof body.apiKey,'string');assert(body.nodeInfoList.some((n:any)=>n.fieldName==='text'&&n.fieldValue==='Managed workflow text'));}if(runtime==='autodl')assert.match(body.load.inputs.image,/^https:/);});
    const completed=await finish(managed.id);check('managed-'+runtime+'-actual-result-and-single-ledger',()=>assert.equal(completed.status,'completed'));assert.equal((await pool.query('SELECT count(*)::int n FROM app_ledger WHERE id=$1',[`led-video-${managed.id}`])).rows[0].n,1);
  }
  console.log(`VIDEO_COMPILED_BYOC=PASS CASES=${cases} REAL_PG=true REAL_ROUTE=true REAL_UPLOAD=true REAL_MEDIA_WORKER=true PAID_CALLS=0`);
 }finally{byoc.mode='ok';await publish(original.config);await closeVideoCoordinationPool();}
}
