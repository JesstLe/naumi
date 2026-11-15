import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {VideoTaskRow} from '../src/lib/video/task-types';
import type {createModelFixture} from './model-config-fixture';
import {createCanvasVideoTools} from '../src/lib/agent/canvas-video-tools';
import {validateToolArguments} from '../src/lib/agent/harness';
import {assertInternalAgentPath} from '../src/lib/agent/harness-network';

export async function verifyCompiledAgent(input:{actor:string;pool:Pool;f:Awaited<ReturnType<typeof createModelFixture>>;posts:()=>number;task:(id:string)=>Promise<VideoTaskRow>;finish:(id:string)=>Promise<VideoTaskRow>;dispatch:(task:VideoTaskRow)=>Promise<void>;completedId:string;check:(name:string,run:()=>void)=>void}){
 const {actor,pool,f,task,finish,dispatch}=input;
 const {withFrozenCreation}=await import('../src/lib/saas/creation-scope');
 const {saveVideoNode,getVideoNode}=await import('../src/lib/canvas/video-node-service');
 const {readTaskCompiledVideoPlan}=await import('../src/lib/video/compiled-task');
 const {agentQuote,agentBillingPrecheck}=await import('../src/lib/billing/agent');
 const {creationToolArguments,assertVideoCreationSettings,freezeCreationSettings}=await import('../src/lib/agent/creation-settings');
 const {signUserSession,USER_COOKIE}=await import('../src/lib/native-auth');const cookie=`${USER_COOKIE}=${signUserSession(actor,Date.now())}`;
 const {POST:generate}=await import('../src/app/api/video/generate/route');
 const {GET:tasks}=await import('../src/app/api/video/tasks/route');
 const {GET:oneTask}=await import('../src/app/api/video/tasks/[id]/route');
 const {GET:nodeRoute}=await import('../src/app/api/canvas/video-nodes/[id]/route');
 const {POST:createNodeRoute}=await import('../src/app/api/canvas/video-nodes/route');
 const {POST:canvasGenerate}=await import('../src/app/api/canvas/video-nodes/[id]/generate/route');
 const {GET:catalog}=await import('../src/app/api/video/catalog/route');
 const calls:string[]=[];
 const internal=async(path:string,_signal?:AbortSignal,init:RequestInit={})=>{
  assertInternalAgentPath(path,init.method||'GET');calls.push((init.method||'GET')+' '+path);const url=new URL(path,'http://127.0.0.1'),req=new Request(url,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),cookie,origin:url.origin}});
  const nodeMatch=url.pathname.match(/^\/api\/canvas\/video-nodes\/([^/]+)(\/generate)?$/),taskMatch=url.pathname.match(/^\/api\/video\/tasks\/([^/]+)$/);
  let response:Response;
  if(url.pathname==='/api/video/generate')response=await generate(req);
  else if(url.pathname==='/api/canvas/video-nodes')response=await createNodeRoute(req);
  else if(url.pathname==='/api/video/catalog')response=await catalog();
  else if(url.pathname==='/api/video/tasks')response=await tasks(req);
  else if(taskMatch)response=await oneTask(req,{params:Promise.resolve({id:decodeURIComponent(taskMatch[1])})});
  else if(nodeMatch)response=nodeMatch[2]?await canvasGenerate(req,{params:Promise.resolve({id:decodeURIComponent(nodeMatch[1])})}):await nodeRoute(req,{params:Promise.resolve({id:decodeURIComponent(nodeMatch[1])})});
  else throw new Error('Unexpected Agent path '+path);
  const body=await response.json();if(!response.ok)throw Object.assign(new Error(body.error||'fixture route failed'),{status:response.status,code:body.code});return body;
 };
 const tools=createCanvasVideoTools({actor,internal}),creation={actorEmail:actor,scopeKind:'personal' as const,tenantId:null};
 const scoped=<T>(run:()=>Promise<T>)=>withFrozenCreation({...creation},run);
 const invoke=(name:string,args:Record<string,unknown>,chosen=tools)=>{const tool=chosen.find(tool=>tool.name===name)!;validateToolArguments(tool.parameters,args);return scoped(async()=>(await tool.execute(randomUUID(),args)).details as any);};
 const config={modelId:'video-fixture',providerId:'managed-video',mode:'text' as const,prompt:'保持全部对白。',parameters:{durationSeconds:1,resolution:'4K'}},source=(await task(input.completedId)).artworkId;
 const inputs=[{id:'agent-source',nodeId:source,kind:'video',role:'source_video',value:'untrusted.mp4'}];
 let cases=0;const check=(name:string,run:()=>void)=>{input.check('agent-'+name,run);cases++;};
 const count=async(table:string)=>Number((await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n);
 const before=await Promise.all(['app_video_tasks','app_gen_reservations','app_creation_records'].map(count));
 if(!process.argv.includes('--agent-baseline')){
 const draftEffects=await Promise.all(['app_video_tasks','app_gen_reservations','app_creation_records'].map(count)),draftPostCount=input.posts();
 const planArgs={mode:'multi_shot',config:{...config,parameters:{...config.parameters,durationSeconds:2}},shots:[{id:'a',prompt:'First full shot',durationSeconds:1},{id:'b',prompt:'Last full shot',durationSeconds:1}]};
 const planned=await invoke('plan_video_storyboard',planArgs),persisted=await getVideoNode(actor,planned.nodeId);assert(persisted);
 check('multishot-planning-real-route-keeps-structure-and-modern-parameters',()=>{assert.deepEqual(persisted.config.parameters,planArgs.config.parameters);assert.deepEqual(persisted.config.shots,planArgs.shots);});
 const {previewCanvasVideo}=await import('../src/lib/video/node-preview');const unsupported=await scoped(()=>previewCanvasVideo(actor,persisted.id,{expectedRevision:persisted.revision,draftRevision:1}));assert(!unsupported.ok);assert.equal(unsupported.diagnostics[0].code,'STRUCTURED_SHOTS_MAPPING_MISSING');
 check('real-preview-not-plan-tool-owns-missing-structure-mapping',()=>assert.equal(input.posts(),draftPostCount));
 const ready=structuredClone((await f.repo.current()).config);const executable=ready.upstreamModels[0].parameterMap.videoExecution!;assert(executable.profileId==='json-video');for(const operation of executable.recipe.operations)operation.shots={wireField:'shots',promptField:'prompt',durationField:'duration'};
 // Reuse the suite publication actor so markApplied advances its draft base;
 // a second actor would leave downstream fixture drafts stale, correctly rejected.
 const held=await f.repo.current(),draft=await f.repo.draft('fixture-admin'),saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,actor:'fixture-admin',config:ready}),published=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:held.version,actor:'fixture-admin',reason:'explicit fixture structured mapping'});await f.repo.markApplied(published.id,published.digest,saved.id);
 const supported=await scoped(()=>previewCanvasVideo(actor,persisted.id,{expectedRevision:persisted.revision,draftRevision:2}));assert(supported.ok,JSON.stringify(supported));
 check('same-saved-agent-draft-compiles-after-explicit-binding-with-no-metadata-change',()=>assert.equal(supported.value.intent,'text'));
 assert.deepEqual(await Promise.all(['app_video_tasks','app_gen_reservations','app_creation_records'].map(count)),draftEffects);assert.equal(input.posts(),draftPostCount);cases++;
 const restoreDraft=await f.repo.draft('fixture-admin'),restore=await f.repo.saveDraft({id:restoreDraft.id,expectedRevision:restoreDraft.revision,actor:'fixture-admin',config:held.config}),restoreStage=await f.repo.stage({id:randomUUID(),draftId:restore.id,expectedRevision:restore.revision,expectedVersion:(await f.repo.current()).version,actor:'fixture-admin',reason:'restore fixture mapping'});await f.repo.markApplied(restoreStage.id,restoreStage.digest,restore.id);
 }
 const callsBeforeQuote=calls.length;
 const quote=await scoped(()=>agentQuote('edit_video',{config,inputs},actor,{cookie,authorization:''}));
 if(process.argv.includes('--agent-baseline')){
  assert(quote);assert.equal((quote.quote as import('../src/lib/billing/types').BillingQuote).facts.resolution,'1K');
  await assert.rejects(()=>invoke('edit_video',{config,inputs,operation_id:randomUUID()}),/真实模型能力/);
  await assert.rejects(()=>invoke('extend_video',{config,inputs,operation_id:randomUUID()}),/真实模型能力/);
  assert.deepEqual(await Promise.all(['app_video_tasks','app_gen_reservations','app_creation_records'].map(count)),before);
  console.log('AGENT_BASELINE_REPRO=CONFIRMED QUOTE_RESOLUTION=1K REQUESTED=4K EXPECTED_EFFECTIVE=2K EDIT_EXTEND=OLD_MODE_VETO EXTRA_TASKS=0');return;
 }
 check('quotation-uses-compiler-effective-facts-not-raw-config',()=>{assert(quote);assert.equal((quote.quote as import('../src/lib/billing/types').BillingQuote).facts.resolution,'2K');assert.equal(config.parameters.resolution,'4K');assert.equal(calls.length,callsBeforeQuote);});
 assert.deepEqual(await Promise.all(['app_video_tasks','app_gen_reservations','app_creation_records'].map(count)),before);
 for(const name of ['edit_video','extend_video']){
  const operation_id=randomUUID(),result=await invoke(name,{config,inputs,operation_id}),saved=await task(result.taskId),plan=readTaskCompiledVideoPlan(actor,saved);
  check(name+'-automatic-input-compilation-despite-poison-capabilities',()=>{assert.equal(plan.intent,'reference');assert.equal(plan.requestedParameters.resolution,'4K');assert.equal(plan.effectiveParameters.resolution,'2K');assert.equal(saved.source,'workbench');assert(!calls.some(call=>call.includes('/catalog')));});
  const attempts=calls.length;const restored=await invoke(name,{config,inputs,operation_id});assert.equal(restored.taskId,saved.id);assert.equal(calls.length,attempts+1);
  await dispatch(saved);await finish(saved.id);
 }
 const imageInputs=[{id:'image-ref',nodeId:'input-art',kind:'image',role:'reference',value:'untrusted.png'}];
 const result=await invoke('generate_video',{config,inputs:imageInputs,operation_id:randomUUID()}),generated=await task(result.taskId);check('generic-generate-same-resolver-and-compiler',()=>assert.equal(readTaskCompiledVideoPlan(actor,generated).intent,'single_image'));await dispatch(generated);await finish(generated.id);
 const postBefore=input.posts(),tasksBefore=await count('app_video_tasks');
 await assert.rejects(()=>invoke('edit_video',{config,inputs:[],operation_id:randomUUID()}),{code:'SOURCE_VIDEO_REQUIRED'});
 await assert.rejects(()=>invoke('extend_video',{config:{...config,intentPreference:'text'},inputs,operation_id:randomUUID()}),{code:'TEXT_INTENT_HAS_MEDIA'});
 await assert.rejects(()=>invoke('generate_video',{config:{...config,parameters:{...config.parameters,unmapped:1}},inputs,operation_id:randomUUID()}),{code:'PARAMETER_MAPPING_MISSING'});
 check('invalid-intent-or-mapping-zero-task-and-provider',()=>assert.equal(input.posts(),postBefore));assert.equal(await count('app_video_tasks'),tasksBefore);
 await assert.rejects(()=>invoke('generate_video',{config:{...config,workflowTaskId:input.completedId},inputs,operation_id:randomUUID()}),{code:'STRUCTURED_INPUT_MAPPING_REQUIRED'});check('structured-history-source-not-silently-ignored-by-preview',()=>assert.equal(input.posts(),postBefore));
 const node=await scoped(()=>saveVideoNode(actor,{id:'agent-owned',expectedRevision:0,operationId:randomUUID(),config,inputs}));
 const canvas={anchorId:'',imageUrls:[],ratio:'auto',resolution:'1K',quality:'medium',video:{projectKey:node.projectKey,nodeId:node.id}};
 const canvasTools=createCanvasVideoTools({actor,internal,canvas});
 const settings=freezeCreationSettings({video:{durationSeconds:1,resolution:'4K'}});assertVideoCreationSettings(config,settings);
 const selected=creationToolArguments('generate_video',{config},freezeCreationSettings({video:{durationSeconds:2}}));
 check('creation-settings-compare-original-parameter-container',()=>{assert.equal((selected.config as typeof config).parameters.durationSeconds,2);assert.equal((selected.config as any).durationSeconds,undefined);assert.equal((selected.config as typeof config).parameters.resolution,'4K');});
 const canvasQuote=await scoped(()=>agentQuote('extend_video',{node_id:node.id,expected_revision:node.revision},actor,{cookie,authorization:'',canvas,creationSettings:settings}));assert(canvasQuote);
 const accepted=await invoke('edit_video',{node_id:node.id,expected_revision:node.revision,operation_id:randomUUID()},canvasTools),canvasTask=await task(accepted.taskId);check('actual-owned-node-route-compiles-and-links',()=>{assert.equal(canvasTask.parameters.nodeId,node.id);assert.equal(readTaskCompiledVideoPlan(actor,canvasTask).scope.projectKey,node.projectKey);});
 const active=await invoke('extend_video',{node_id:node.id,expected_revision:node.revision,operation_id:randomUUID()},canvasTools);assert.equal(active.taskId,canvasTask.id);await dispatch(canvasTask);await finish(canvasTask.id);
 const fresh=await getVideoNode(actor,node.id);assert(fresh);await assert.rejects(()=>invoke('edit_video',{node_id:node.id,expected_revision:node.revision,operation_id:randomUUID()},canvasTools),/视频节点已更新/);
 const foreign=createCanvasVideoTools({actor:'other-agent@fixture.test',internal,canvas});await assert.rejects(()=>invoke('edit_video',{node_id:node.id,expected_revision:fresh.revision,operation_id:randomUUID()},foreign),{code:'VIDEO_NODE_UNAVAILABLE'});check('node-cas-and-real-owner-checked-before-execution',()=>assert.equal(input.posts(),postBefore+1));
 const {restructureVideoDrafts,storyboardDraftInputs,editStoryboardDuration}=await import('../src/lib/video/storyboard-edit');
 const editorial={...fresh,config:{...config,prompt:'保留 {{ref 2}}。',negativePrompt:'保留负面描述',parameters:{...config.parameters,custom:'unmapped retained',generateAudio:false}},inputs:[{id:'author',nodeId:'inline:author',kind:'text' as const,role:'author' as const,value:'原稿关联'},...fresh.inputs]};
 const split=restructureVideoDrafts([editorial]);check('storyboard-split-retains-all-parameters-and-reference-identity',()=>{assert.equal(split[0].prompt,'保留 {{ref 1}}。');assert.deepEqual(split[0].parameters,editorial.config.parameters);assert.equal(split[1].prompt,'');assert.equal(split[0].negativePrompt,'保留负面描述');});
 const draftCount=await count('app_video_tasks'),draftPosts=input.posts();
 for(const [index,draft]of split.entries()){const savedDraft:import('../src/lib/canvas/video-node-schema').CanvasVideoNode=await scoped(()=>saveVideoNode(actor,{id:'storyboard-agent-draft-'+index,projectKey:fresh.projectKey,expectedRevision:0,operationId:randomUUID(),config:draft,inputs:storyboardDraftInputs(editorial)}));assert.deepEqual(savedDraft.config,draft);}
 check('storyboard-real-save-nonexecutable-drafts-zero-generation',()=>assert.equal(input.posts(),draftPosts));assert.equal(await count('app_video_tasks'),draftCount);
 const sibling={...editorial,id:'second-shot',config:editStoryboardDuration({...editorial.config,prompt:'第二镜头'},3)};
 const merged=restructureVideoDrafts([editorial,sibling])[0];check('storyboard-merge-sums-only-known-durations-without-reconcile',()=>{assert.equal(merged.parameters?.durationSeconds,4);assert.equal(merged.parameters?.resolution,'4K');assert.equal(merged.parameters?.generateAudio,false);assert.equal(merged.parameters?.custom,'unmapped retained');});
 const conflict={...sibling,config:{...sibling.config,parameters:{...sibling.config.parameters,custom:'different'}}};assert.throws(()=>restructureVideoDrafts([editorial,conflict]),/合镜前请统一/);
 const automatic={...editorial,config:editStoryboardDuration(editorial.config,-1)};check('storyboard-unknown-duration-not-fabricated-and-conflicts-visible',()=>assert.equal(restructureVideoDrafts([automatic,sibling])[0].parameters?.durationSeconds,-1));
 const publication=await f.repo.current(),draft=await f.repo.draft('fixture-admin'),disabled=structuredClone(draft.config);disabled.publicModels[0].enabled=false;disabled.publicModels[0].toolScope!.defaultFor=[];disabled.publicModels.push({...structuredClone(disabled.publicModels[0]),id:'agent-other-model',enabled:true});disabled.bindings={'video.generate':'agent-other-model'};
 const saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,actor:'fixture-admin',config:disabled}),stage=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:publication.version,actor:'fixture-admin',reason:'agent receipt recovery fixture'});await f.repo.markApplied(stage.id,stage.digest,saved.id);
 const restored=await invoke('generate_video',{config,inputs:imageInputs,operation_id:generated.idempotencyKey!});assert.equal(restored.taskId,generated.id);
 const precheck=await scoped(()=>agentBillingPrecheck({email:actor,id:randomUUID(),cred:{cookie,authorization:''}},'generate_video',{config,inputs:imageInputs,operation_id:generated.idempotencyKey!},randomUUID()));check('accepted-receipt-bypasses-new-model-disable-and-precheck',()=>assert.equal(precheck,undefined));
 await assert.rejects(()=>invoke('generate_video',{config,inputs:imageInputs,operation_id:randomUUID()}),{code:'MODEL_UNAVAILABLE'});
 const resetDraft=await f.repo.draft('fixture-admin'),reset=await f.repo.saveDraft({id:resetDraft.id,expectedRevision:resetDraft.revision,actor:'fixture-admin',config:publication.config}),resetStage=await f.repo.stage({id:randomUUID(),draftId:reset.id,expectedRevision:reset.revision,expectedVersion:(await f.repo.current()).version,actor:'fixture-admin',reason:'restore own fixture'});await f.repo.markApplied(resetStage.id,resetStage.digest,reset.id);
 console.log(`VIDEO_COMPILED_AGENT=PASS CASES=${cases} REAL_PG=true REAL_ROUTES=true REAL_TOOLS=true REAL_SUPPLIER_HTTP=true PAID_CALLS=0`);
}
