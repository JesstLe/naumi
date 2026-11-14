import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {Pool} from 'pg';
import type {ModelConfig} from '../src/lib/model-config/types';
import type {CompiledVideoPlan} from '../src/lib/video/execution-contract';
import type {CreateVideoInput} from '../src/lib/video/submission-types';
import type {VideoReference} from '../src/lib/video/types';
import {videoSubmissionDraftValue} from '../src/lib/video/submission-draft-value';
import presets from '../src/lib/model-config/video-execution-presets.json';

type HttpResult={status:number;value:any};
/** Real authenticated listener / independent Worker / native media acceptance.
 * Only fixture publications, input bytes and scheduling/lifecycle are controlled.
 * No Route, compiler, submission or dispatch function is invoked directly. */
export async function verifyVideoAdvancedInputs(input:{actor:string;pool:Pool;root:string;
 assets:Array<{key:string;kind:'image'|'video'|'audio';sha256:string}>;originalConfig:ModelConfig;
 http:(route:string,body?:unknown,as?:string)=>Promise<HttpResult>;otherCookie:string;
 patch:(route:string,body:unknown)=>Promise<HttpResult>;
 calls:Array<{body:any;key?:string}>;inputReads:Array<{sha256:string;bytes:number}>;
 counts:()=>Promise<Record<string,number>>;publish:(config:ModelConfig)=>Promise<unknown>;
 task:(id:string)=>Promise<any>;readPlan:(id:string)=>Promise<CompiledVideoPlan>;due:(id:string)=>Promise<void>;
 resume:()=>Promise<unknown>;drain:()=>Promise<unknown>;restart:()=>Promise<unknown>;
 until:<T>(name:string,read:()=>Promise<T>,accept:(value:T)=>boolean,ms?:number)=>Promise<T>}){
 const {pool,http,actor}=input,checks:string[]=[],runs:any[]=[],beforePosts=input.calls.length,beforeReads=input.inputReads.length;
 const pass=(name:string)=>{checks.push(name);console.log('ADVANCED_INPUT_CHECK='+name+' PASS');};
 const ledger=async()=>(await pool.query("SELECT count(*)::int n,COALESCE(-sum(delta),0)::int amount FROM app_ledger WHERE kind='consume' AND email=$1",[actor])).rows[0] as {n:number;amount:number};
 const beforeLedger=await ledger(),params={durationSeconds:1,resolution:'4K'};
 const source=(index:number,id:string,role:VideoReference['role']):VideoReference=>({id,kind:input.assets[index].kind,role,artworkId:assets[index].artworkId,
  // Forged URL/metadata must never replace the owned identity or decoded facts.
  url:'https://forged-advanced.invalid/input',mimeType:'image/not-real',bytes:1,durationSeconds:0.01,width:1,height:1});
 const assets:any[]=[];
 const draft=(request:Partial<CreateVideoInput>)=>videoSubmissionDraftValue({source:'workbench',prompt:'ADVANCED',seconds:'',size:'',...request});
 const preview=(request:any,as?:string)=>http('/api/video/compile-preview',{modelId:'video-process',projectKey:request.projectKey??null,draftRevision:1,draft:draft(request)},as);
 const complete=async(id:string)=>{await input.resume();await input.due(id);const done=await input.until('advanced output '+id,()=>input.task(id),row=>row?.status==='completed',150000);await input.drain();return done;};
 const accept=async(name:string,request:any,verify:(body:any,plan:CompiledVideoPlan)=>void,options:{afterAccept?:()=>Promise<void>}={})=>{
  const counts=await input.counts(),posts=input.calls.length,p=await preview(request);assert.equal(p.status,200,JSON.stringify(p.value));assert(p.value.ok,JSON.stringify(p.value));
  assert.deepEqual(await input.counts(),counts);assert.equal(input.calls.length,posts);pass(name+'-preview-zero-side-effects');
  const body={source:'workbench',modelId:'video-process',...request,idempotencyKey:randomUUID()},accepted=await http('/api/video/generate',body);
  assert.equal(accepted.status,200,JSON.stringify(accepted.value));const id=accepted.value.taskId,plan=await input.readPlan(id);
  assert.equal(plan.digest,p.value.value.planDigest);assert.equal(input.calls.length,posts);if(name==='explicit-frames-reversed-input-order'){const replay=await http('/api/video/generate',body);assert.equal(replay.value.taskId,id);}
  pass(name+'-preview-acceptance-digest-and-single-receipt');await options.afterAccept?.();
  const done=await complete(id);assert.equal(input.calls.length,posts+1);const sent=input.calls.at(-1)!;verify(sent.body,plan);
  assert(!JSON.stringify(sent).includes('forged-advanced.invalid'));assert.equal((await pool.query('SELECT count(*)::int n FROM app_ledger WHERE id=$1',['led-video-'+id])).rows[0].n,1);
  assert.equal(done.cost,17);assert(done.artwork_id&&done.result_storage_key);
  const history=await http('/api/video/tasks/'+id);assert.equal(history.status,200);assert.equal(history.value.snapshot.config.parameters.resolution,request.parameters?.resolution??'4K');
  runs.push({name,id,planVersion:plan.schemaVersion,intent:plan.intent,inputManifest:plan.inputManifest,wireTemplate:plan.wireTemplate,artworkId:done.artwork_id});pass(name+'-real-worker-wire-assets-and-one-ledger');return {id,plan,done};
 };
 const reject=async(name:string,request:any,expected:string[],options:{as?:string;previewDraft?:unknown}={})=>{
  const before=await input.counts(),posts=input.calls.length;
  const p=options.previewDraft?await http('/api/video/compile-preview',{modelId:'video-process',projectKey:request.projectKey??null,draftRevision:1,draft:options.previewDraft},options.as):await preview(request,options.as);
  assert.equal(p.status,422,JSON.stringify(p.value));assert(expected.includes(p.value.diagnostics?.[0]?.code??p.value.code),JSON.stringify(p.value));
  const submitted=await http('/api/video/generate',{source:'workbench',modelId:'video-process',...request,idempotencyKey:randomUUID()},options.as);
  assert.equal(submitted.status,422,JSON.stringify(submitted.value));assert(expected.includes(submitted.value.code),JSON.stringify(submitted.value));
  assert.deepEqual(await input.counts(),before);assert.equal(input.calls.length,posts);pass(name+'-preview-and-submit-reject-zero-business-effects');
 };
 try{
  for(const asset of input.assets){const r=await http('/api/video/assets',{operationId:randomUUID(),storageKey:asset.key,title:'Advanced '+asset.key,kind:asset.kind});assert.equal(r.status,201,JSON.stringify(r.value));assert.equal(r.value.asset.sha256,asset.sha256);assets.push(r.value.asset);}
  pass('four-inputs-actual-import-HTTP-and-decoded-hash-identity');
  const json=structuredClone(input.originalConfig),execution=json.upstreamModels[0].parameterMap.videoExecution!;assert.equal(execution.profileId,'json-video');
  const recipe=execution.recipe as import('zod').infer<typeof import('../src/lib/video/profiles/json-profile').jsonVideoRecipeSchema>;
  // Same released field compiler; explicit local fixture binding, never modes/limits.
  recipe.operations=[
   {intent:'text',media:[]},
   {intent:'single_image',images:{min:1,max:1},media:[{kind:'image',wireField:'image_urls',shape:'urls'}]},
   {intent:'frames_required',images:{min:2,max:2},media:[{kind:'image',wireField:'image_urls',shape:'urls',order:['first_frame','last_frame']}]},
   {intent:'reference',images:{min:0,max:4},videos:{min:0,max:2,maxDurationSeconds:4},audios:{min:0,max:2,maxDurationSeconds:4},
    media:[{kind:'image',wireField:'image_urls',shape:'urls'},{kind:'video',wireField:'video_urls',shape:'urls'},{kind:'audio',wireField:'audio_urls',shape:'urls'}],
    shots:{wireField:'multi_prompt',promptField:'prompt',durationField:'duration',indexField:'index',max:6,minDurationSeconds:0.25,durationStep:0.25,constants:{multi_shot:true,shot_type:'customize'}},
    elements:{wireField:'element_list',nameField:'name',descriptionField:'description',max:3,media:[{kinds:['image'],wireField:'image_urls',min:1,max:2},{kinds:['audio'],wireField:'audio_urls',min:0,max:1}]}}
  ];
  await input.publish(json);
  const frames=[source(1,'last','last_frame'),source(0,'first','first_frame')];
  await accept('explicit-frames-reversed-input-order',{prompt:'ADVANCED_FRAMES',parameters:params,references:frames},(body,plan)=>{assert.equal(plan.intent,'frames_required');assert.deepEqual((plan.wireTemplate.body as any).image_urls,[{$videoAsset:'first'},{$videoAsset:'last'}]);assert.equal(body.image_urls.length,2);});
  await accept('two-ordinary-images-remain-reference',{prompt:'ADVANCED_ORDINARY',parameters:params,mode:'text',references:[source(0,'a','reference'),source(1,'b','reference')]},(body,plan)=>{assert.equal(plan.intent,'reference');assert.equal(body.image_urls.length,2);assert(plan.inputManifest.every(i=>i.role==='reference'));});
  await accept('image-video-audio-mixed',{prompt:'ADVANCED_MIXED',parameters:params,references:[source(0,'picture','reference'),source(2,'motion','source_video'),source(3,'sound','source_audio')]},(body,plan)=>{assert.equal(plan.intent,'reference');for(const field of ['image_urls','video_urls','audio_urls'])assert.equal(body[field].length,1);const video=plan.inputManifest.find(i=>i.kind==='video');assert(video&&video.kind!=='text');assert.equal(video.asset.durationSeconds,3);});
  await accept('audio-only-explicit-reference',{prompt:'ADVANCED_AUDIO',intentPreference:'omni_reference',parameters:params,references:[source(3,'sound','source_audio')]},(body,plan)=>{assert.equal(plan.intent,'reference');assert.equal(body.audio_urls.length,1);assert(!body.image_urls&&!body.video_urls);});
  const anchor=await http('/api/canvas/video-nodes',{id:'advanced-anchor',expectedRevision:0,operationId:randomUUID(),config:{modelId:'video-process',prompt:'Advanced project',parameters:params}});assert.equal(anchor.status,201,JSON.stringify(anchor.value));const projectKey=anchor.value.node.projectKey;
  const saveText=async(content:string)=>{const result=await http('/api/canvas/text-nodes',{id:'advanced-shot-text',projectKey,title:'Advanced shot',content,status:'completed',canvasX:0,canvasY:0,width:300,height:176});assert.equal(result.status,200,JSON.stringify(result.value));};await saveText('OWNED_ADVANCED_SHOT');
  const structured={projectKey,prompt:'ADVANCED_STRUCTURE',parameters:params,shots:[{id:'one',textNodeId:'text:advanced-shot-text',prompt:'FORGED_ADVANCED_SHOT',durationSeconds:0.5},{id:'two',prompt:'Second exact shot',durationSeconds:0.5}],elements:[{id:'character',name:'Character',description:'Identity source',references:[source(0,'identity','element'),source(3,'voice','element')]}]};
  const drift=structuredClone(json);const changedRecipe=drift.upstreamModels[0].parameterMap.videoExecution!.recipe as typeof recipe;changedRecipe.operations.find(o=>o.intent==='reference')!.elements!.wireField='changed_element_list';drift.upstreamModels[0].model='changed-after-advanced-acceptance';
  const frozen=await accept('nested-shots-elements-frozen-across-restart',structured,(body,plan)=>{assert.equal(plan.schemaVersion,2);assert.equal(body.multi_prompt[0].prompt,'OWNED_ADVANCED_SHOT');assert.equal(body.multi_prompt[1].index,2);assert.equal(body.element_list[0].image_urls.length,1);assert.equal(body.element_list[0].audio_urls.length,1);assert(!body.changed_element_list&&!body.image_urls);assert.equal(body.model,'future-process-video');},{afterAccept:async()=>{await input.publish(drift);await saveText('CHANGED_AFTER_ACCEPTANCE');await input.restart();}});
  const frozenHistory=await http('/api/video/tasks/'+frozen.id);assert.equal(frozenHistory.value.snapshot.config.shots[0].prompt,'OWNED_ADVANCED_SHOT');assert.equal(frozenHistory.value.snapshot.config.elements[0].references.length,2);pass('structured-history-restores-grouping-and-original-shot-text');
  await input.publish(json);
  const {projectKey:_project,...nodeConfig}=structured;
  const invalidBefore=await input.counts(),invalidPosts=input.calls.length;
  const invalid=await http('/api/canvas/video-nodes',{id:'advanced-invalid-address',projectKey,expectedRevision:0,operationId:randomUUID(),config:{modelId:'video-process',...nodeConfig}});
  assert.equal(invalid.status,process.argv.includes('--expect-old-node-error')?503:422,JSON.stringify(invalid.value));
  if(invalid.status===422){assert.equal(invalid.value.code,'REFERENCE_UNAVAILABLE');assert.deepEqual(invalid.value.fields,['references']);}
  const invalidPatch=await input.patch('/api/canvas/video-nodes/advanced-anchor',{expectedRevision:anchor.value.node.revision,operationId:randomUUID(),config:{modelId:'video-process',...nodeConfig}});
  assert.equal(invalidPatch.status,invalid.status,JSON.stringify(invalidPatch.value));if(invalidPatch.status===422)assert.equal(invalidPatch.value.code,'REFERENCE_UNAVAILABLE');
  assert.equal((await http('/api/canvas/video-nodes/advanced-anchor')).value.node.revision,anchor.value.node.revision);
  assert.deepEqual(await input.counts(),invalidBefore);assert.equal(input.calls.length,invalidPosts);pass('canvas-invalid-reference-keeps-validation-and-structured-error');
  // Canvas persistence separately validates supplied addresses. Use canonical
  // identities there; the HTTP generation probes above deliberately include
  // forged metadata to prove that the new resolver uses the owned asset.
  nodeConfig.elements=nodeConfig.elements.map(element=>({...element,references:element.references.map(({url:_url,mimeType:_mime,bytes:_bytes,durationSeconds:_duration,width:_width,height:_height,...identity})=>identity)}));
  const node=await http('/api/canvas/video-nodes',{id:'advanced-structured',projectKey,expectedRevision:0,operationId:randomUUID(),config:{modelId:'video-process',...nodeConfig}});assert.equal(node.status,201,JSON.stringify(node.value));
  const nodeRevision=node.value.node.revision,counts=await input.counts(),nodePreview=await http('/api/canvas/video-nodes/advanced-structured/compile-preview',{expectedRevision:nodeRevision,draftRevision:1});assert.equal(nodePreview.status,200,JSON.stringify(nodePreview.value));assert.deepEqual(await input.counts(),counts);
  const nodeSubmission=await http('/api/canvas/video-nodes/advanced-structured/generate',{expectedRevision:nodeRevision,idempotencyKey:randomUUID()});assert.equal(nodeSubmission.status,202,JSON.stringify(nodeSubmission.value));const nodeId=nodeSubmission.value.taskId,nodePlan=await input.readPlan(nodeId);assert.equal(nodePlan.digest,nodePreview.value.value.planDigest);const nodeDone=await complete(nodeId);assert.equal(input.calls.at(-1)!.body.multi_prompt[0].prompt,'CHANGED_AFTER_ACCEPTANCE');runs.push({name:'canvas-structured',id:nodeId,artworkId:nodeDone.artwork_id});pass('canvas-structured-preview-acceptance-original-grouping');
  const cancelled=await http('/api/video/generate',{source:'workbench',modelId:'video-process',...structured,prompt:'ADVANCED_RETRY',idempotencyKey:randomUUID()});assert.equal(cancelled.status,200,JSON.stringify(cancelled.value));const cancelledId=cancelled.value.taskId;assert.equal((await http('/api/video/tasks/'+cancelledId+'/cancel',{})).status,200);
  await saveText('CHANGED_BEFORE_RETRY');
  const retryRequest={idempotencyKey:randomUUID()},retry=await http('/api/video/tasks/'+cancelledId+'/retry',retryRequest);assert.equal(retry.status,202,JSON.stringify(retry.value));assert.equal((await http('/api/video/tasks/'+cancelledId+'/retry',retryRequest)).value.taskId,retry.value.taskId);const retried=await complete(retry.value.taskId);
  assert.equal(input.calls.at(-1)!.body.multi_prompt[0].prompt,'CHANGED_AFTER_ACCEPTANCE');assert.equal((await input.task(cancelledId)).status,'cancelled');assert.equal((await input.task(retry.value.taskId)).parameters.retryOf,cancelledId);runs.push({name:'structured-explicit-retry',id:retried.id});pass('structured-retry-keeps-original-shot-groups-and-single-new-operation');
  await reject('missing-explicit-frame',{prompt:'ADVANCED_BAD',parameters:params,intentPreference:'frames_required',references:[source(0,'only','first_frame')]},['FRAME_INPUT_REQUIRED']);
  await reject('shot-total-mismatch',{...structured,shots:[{id:'bad',prompt:'Wrong total',durationSeconds:0.25}]},['SHOT_DURATION_TOTAL_MISMATCH']);
  const {projectKey:_foreignProject,...foreignRequest}=structured;
  await reject('foreign-nested-media',foreignRequest,['VIDEO_INPUT_UNAVAILABLE','TEXT_REFERENCE_UNAVAILABLE','VIDEO_SCOPE_MISMATCH'],{as:input.otherCookie});
  // The duration negative uses a separate explicit lower physical limit.
  const limited=structuredClone(json);(limited.upstreamModels[0].parameterMap.videoExecution!.recipe as typeof recipe).operations.find(o=>o.intent==='reference')!.videos!.maxDurationSeconds=2;await input.publish(limited);
  await reject('decoded-video-exceeds-published-limit',{prompt:'ADVANCED_BAD',parameters:params,references:[source(2,'video','source_video')]},['MEDIA_PROPERTIES_OUT_OF_RANGE']);
  await input.publish(json);
  const duplicate=[source(0,'same','reference'),source(1,'same','reference')];await reject('duplicate-media-identities',{prompt:'ADVANCED_BAD',parameters:params,references:duplicate},['DUPLICATE_INPUT','INVALID_VIDEO_SUBMISSION'],{previewDraft:{prompt:'ADVANCED_BAD',parameters:params,inputs:duplicate.map(r=>({id:r.id,nodeId:r.artworkId,kind:r.kind,role:r.role}))}});
  const unsupported=structuredClone(json);delete (unsupported.upstreamModels[0].parameterMap.videoExecution!.recipe as typeof recipe).operations.find(o=>o.intent==='reference')!.elements;await input.publish(unsupported);await reject('no-structure-wire-mapping',structured,['STRUCTURED_ELEMENTS_MAPPING_MISSING']);
  // Also exercise native plan4/plan5 serialization through the same listener.
  for(const [name,model,request,expected]of [
   ['native-frames','kling-v4',{prompt:'ADVANCED_NATIVE_FRAMES',parameters:{durationSeconds:3,resolution:'720p'},references:frames},'frames_required'],
   ['native-multimodal','seedance-2.5',{prompt:'ADVANCED_NATIVE_MIXED',parameters:{durationSeconds:4,resolution:'720p'},references:[source(0,'picture','reference'),source(2,'motion','source_video'),source(3,'sound','source_audio')]},'reference'],
   ['native-storyboard','kling-v3',{prompt:'ADVANCED_NATIVE_SHOTS',parameters:{durationSeconds:3,resolution:'720p'},shots:[{id:'one',prompt:'Native one',durationSeconds:1},{id:'two',prompt:'Native two',durationSeconds:2}]},'text']
  ] as const){
   const entry=presets.items.find(i=>i.model===model)!,native=structuredClone(input.originalConfig);native.providers[0].options={...native.providers[0].options,videoProfile:entry.profile as any};native.upstreamModels[0].parameterMap={videoExecution:structuredClone(entry.execution) as any};
   (native.upstreamModels[0].parameterMap.videoExecution!.recipe as any).createPath='/v1/videos/generations';await input.publish(native);
   await accept(name,structuredClone(request),(body,plan)=>{assert.equal(plan.intent,expected);assert.equal(plan.schemaVersion,name==='native-storyboard'?5:4);if(name==='native-storyboard'){assert.equal(body.multi_prompt[1].duration,2);assert.equal(body.multi_shot,true);}else if(name==='native-multimodal'){assert.equal(body.video_urls.length,1);assert.equal(body.audio_urls.length,1);assert.equal(body.omni_reference_task_type,'reference');}else assert.equal(body.image_urls.length,2);});
  }
  const after=await ledger(),added={n:after.n-beforeLedger.n,amount:after.amount-beforeLedger.amount};assert.deepEqual(added,{n:runs.length,amount:runs.length*17});assert.equal(input.calls.length-beforePosts,runs.length);
  for(const run of runs)assert.equal((await pool.query('SELECT count(*)::int n FROM app_ledger WHERE id=$1',['led-video-'+run.id])).rows[0].n,1);
  assert.equal(input.calls.some(c=>JSON.stringify(c.body).includes('FORGED_ADVANCED_SHOT')),false);const hashes=new Set(input.inputReads.slice(beforeReads).map(r=>r.sha256));for(const asset of input.assets)assert(hashes.has(asset.sha256));pass('all-input-original-byte-hashes-and-exact-ledger-counts');
  await writeFile(path.join(input.root,'ADVANCED_INPUT_RESULT.json'),JSON.stringify({ok:true,checks,runs,ledgerAdded:added,supplierPostsAdded:input.calls.length-beforePosts,inputReadsAdded:input.inputReads.slice(beforeReads),actualNext:true,actualIndependentWorker:true,actualNativeMedia:true,paidCalls:0,productionWrites:0},null,2));
  console.log('VIDEO_ADVANCED_INPUTS=PASS CHECKS='+checks.length+' RUNS='+runs.length+' LEDGER_ADDED='+added.amount+' REAL_NEXT=1 REAL_INDEPENDENT_WORKER=1 REAL_NATIVE_MEDIA=1 PAID_CALLS=0 PRODUCTION_WRITES=0');return added;
 }catch(error){await writeFile(path.join(input.root,'ADVANCED_INPUT_FAILURE.json'),JSON.stringify({checks,runs,error:String(error),postsAdded:input.calls.length-beforePosts},null,2));throw error;}
 finally{await input.publish(input.originalConfig);}
}
