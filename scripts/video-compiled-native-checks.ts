import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import type {Pool} from 'pg';
import type {VideoTaskRow} from '../src/lib/video/task-types';
import type {CreateVideoInput} from '../src/lib/video/submission-types';
import type {createModelFixture} from './model-config-fixture';
import type {NativeVideoRecipe} from '../src/lib/video/profiles/native-profile';

/** Real common acceptance/PG/frozen execution/local HTTP/result/ledger owners. */
export async function verifyCompiledNative(input:{actor:string;pool:Pool;f:Awaited<ReturnType<typeof createModelFixture>>;key:string;posts:()=>number;received:Array<{path:string;body:Record<string,any>}>;task:(id:string)=>Promise<VideoTaskRow>;finish:(id:string)=>Promise<VideoTaskRow>;dispatch:(t:VideoTaskRow)=>Promise<void>;check:(name:string,run:()=>void)=>void;setMode:(v:'ok'|'reject'|'disconnect')=>void}){
 const {actor,pool,f,task,finish,dispatch,key}=input;let cases=0;const check=(name:string,run:()=>void)=>{input.check('native-'+name,run);cases++;};
 const {withFrozenCreation}=await import('../src/lib/saas/creation-scope');
 const {createVideoGeneration}=await import('../src/lib/video/creation');
 const {readTaskCompiledVideoPlan,compiledVideoRetryInput}=await import('../src/lib/video/compiled-task');
 const {previewVideoExecution}=await import('../src/lib/video/compile-preview');
 const {projectVideoUiContract}=await import('../src/lib/video/ui-projection');
 const {freezeManagedVideoCapability}=await import('../src/lib/video/frozen-capability');
 const {publicModelCatalog}=await import('../src/lib/model-config/public-catalog');
 const {videoSubmissionDraft}=await import('../src/lib/video/submission-draft');
 const {handleVideoCreationError}=await import('../src/lib/video/runtime');
 const scoped=<T>(run:()=>Promise<T>)=>withFrozenCreation({actorEmail:actor,scopeKind:'personal',tenantId:null},run);
 const original=await f.repo.current();
 const publish=async(config:typeof f.config)=>{const current=await f.repo.current(),draft=await f.repo.draft('fixture-admin'),saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,actor:'fixture-admin',config}),publication=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor:'fixture-admin',reason:'native byte transport local fixture'});return f.repo.markApplied(publication.id,publication.digest,saved.id);};
 const count=async(table:string)=>Number((await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n);
 try{
  for(const layout of ['openai-videos','gemini','openai-legacy'] as const){
   const config=structuredClone(original.config);config.providers[0].protocol=layout==='gemini'?'gemini':'openai-videos';config.providers[0].baseUrl=f.origin;
   config.providers[0].options={...(layout==='openai-legacy'?{}:{videoProfile:layout}),idempotencyStrategy:'header',...(layout==='openai-legacy'?{pollPath:'/v1/videos/{id}',contentPath:'/v1/videos/{id}/content'}:{})};
   const recipe:NativeVideoRecipe={layout,sizes:{'2K':{'16:9':[2048,1080],'9:16':[1080,2048]}},defaults:{ordinaryImage:'single_image'},parameters:{durationSeconds:{type:'integer',default:1,send:'semantic'},resolution:{type:'string',default:'4K',mapping:{'4K':'2K'},send:'semantic'},aspectRatio:{type:'string',default:'16:9',send:'semantic'},...(layout==='gemini'?{enhancePrompt:{type:'boolean',default:false,wireField:'enhancePrompt'}}:{})},operations:[{intent:'text'},{intent:'single_image',images:{min:1,max:1}},...(layout==='gemini'?[{intent:'frames_required' as const}]:[]),{intent:'reference'}]};
   config.upstreamModels[0].parameterMap={videoExecution:{schemaVersion:1,profileId:'native-video',profileVersion:1,recipe}};
   const snapshot=await publish(config),catalog=publicModelCatalog(snapshot,'video','video.generate').models[0];
   const frozen=await freezeManagedVideoCapability(snapshot,config.upstreamModels[0],config.providers[0],f.sql),ui=projectVideoUiContract(frozen.execution!,{publicModelId:'video-fixture',wireModel:config.upstreamModels[0].model,connectionId:config.providers[0].id});
   check(layout+'-public-contract-with-poisoned-legacy-caps',()=>{assert(catalog);assert(JSON.stringify(ui).includes('single_image'));assert(!JSON.stringify(ui).includes('native-video'));});
   const base:CreateVideoInput={source:'workbench',modelId:'video-fixture',prompt:'Native input action',mode:'text',parameters:{durationSeconds:1,resolution:'4K'},seconds:'',size:'',references:[{id:'native-image',kind:'image',role:'reference',artworkId:'input-art',storageKey:key}]};
   const before=await Promise.all(['app_video_tasks','app_gen_reservations','app_ledger'].map(count)),network=input.posts();
   const preview=await scoped(()=>previewVideoExecution(actor,{modelId:'video-fixture',draft:videoSubmissionDraft(base),draftRevision:4}));assert(preview.ok,JSON.stringify(preview));
   check(layout+'-preview-no-post-or-write',()=>assert.equal(input.posts(),network));assert.deepEqual(await Promise.all(['app_video_tasks','app_gen_reservations','app_ledger'].map(count)),before);
   const receipt=await scoped(()=>createVideoGeneration(actor,{...base,idempotencyKey:randomUUID()})),queued=await task(receipt.taskId),plan=readTaskCompiledVideoPlan(actor,queued);
   check(layout+'-preview-submit-identical-version4-plan',()=>{assert.equal(plan.schemaVersion,4);assert.equal(plan.digest,preview.value.planDigest);assert.equal(plan.requestedParameters.resolution,'4K');assert.equal(plan.billingFacts.resolution,'2K');assert.equal(plan.intent,'single_image');assert(!JSON.stringify(plan).includes('base64'));assert(!JSON.stringify(plan).includes(f.marker));});
   // Change current mapping after acceptance. Restored old plan/transport wins.
   const next=structuredClone(config);const r=next.upstreamModels[0].parameterMap.videoExecution!;assert(r.profileId==='native-video');r.recipe.createPath=layout==='gemini'?'/changed/{model}':'/changed';await publish(next);
   await dispatch(queued);const actual=input.received.at(-1)!;
   check(layout+'-actual-byte-wire-not-url-or-new-recipe',()=>{
    assert(!actual.path.includes('/changed'));assert.equal(input.posts(),network+1);assert.equal((actual as {key?:string}).key,queued.idempotencyKey);
    const image=plan.inputManifest.find(i=>i.kind==='image');assert(image&&image.kind!=='text');
    if(layout==='gemini'){const inline=actual.body.instances[0].referenceImages[0].image.inlineData;assert.equal(inline.mimeType,image.asset.mimeType);assert.equal(Buffer.from(inline.data,'base64').length,image.asset.bytes);assert.equal(createHash('sha256').update(Buffer.from(inline.data,'base64')).digest('hex'),image.asset.sha256);assert.equal(actual.body.parameters.enhancePrompt,false);assert.equal(actual.body.parameters.resolution,'2K');}
    else {assert.equal(actual.body.input_reference.sha256,image.asset.sha256);assert.equal(actual.body.input_reference.name,'reference.png');assert.equal(actual.body.size,layout==='openai-legacy'?'2K':'2048x1080');assert.equal(actual.body.seconds,'1');}
   });
   const done=await finish(queued.id);check(layout+'-result-lineage-and-single-ledger',()=>assert.equal(done.status,'completed',done.error));assert.equal((await pool.query('SELECT count(*)::int n FROM app_ledger WHERE id=$1',[`led-video-${queued.id}`])).rows[0].n,1);
   await publish(config);
   const textReceipt=await scoped(()=>createVideoGeneration(actor,{...base,references:[],idempotencyKey:randomUUID()})),text=await task(textReceipt.taskId);await dispatch(text);await finish(text.id);
   check(layout+'-text-request-transport',()=>{const wire=input.received.at(-1)!.body;assert(layout==='gemini'?wire.instances[0].prompt===base.prompt:wire.model===plan.identity.wireModel);assert(!wire.input_reference);});
   const rejectReceipt=await scoped(()=>createVideoGeneration(actor,{...base,idempotencyKey:randomUUID()})),rejectedTask=await task(rejectReceipt.taskId);input.setMode('reject');try{await dispatch(rejectedTask);}catch(e){await handleVideoCreationError(actor,rejectedTask,e);}finally{input.setMode('ok');}
   const rejectedState=await task(rejectedTask.id);check(layout+'-upstream-rejection-refund',()=>assert.equal(rejectedState.status,'failed'));assert.equal((await pool.query('SELECT count(*)::int n FROM app_gen_reservations WHERE job_id=$1',[rejectedTask.id])).rows[0].n,0);
   const retry=compiledVideoRetryInput(actor,await task(rejectedTask.id));check(layout+'-explicit-retry-original-4k',()=>assert.equal(retry.parameters!.resolution,'4K'));
   const retryReceipt=await scoped(()=>createVideoGeneration(actor,{...retry,idempotencyKey:randomUUID()})),retryTask=await task(retryReceipt.taskId);await dispatch(retryTask);await finish(retryTask.id);
   const unknownReceipt=await scoped(()=>createVideoGeneration(actor,{...base,idempotencyKey:randomUUID()})),unknown=await task(unknownReceipt.taskId);input.setMode('disconnect');try{await dispatch(unknown);}catch(e){await handleVideoCreationError(actor,unknown,e);}finally{input.setMode('ok');}
   check(layout+'-unknown-not-recompiled-or-reposted',()=>assert.equal((unknown.parameters as any).version,3));assert.equal((await task(unknown.id)).errorCode,'creation_unknown');
   const postCount=input.posts();await dispatch(await task(unknown.id)).catch(()=>{});assert.equal(input.posts(),postCount);
   const bodyConfig=structuredClone(config);bodyConfig.providers[0].options={...bodyConfig.providers[0].options,idempotencyStrategy:'body',idempotencyBodyField:'request_id'};await publish(bodyConfig);
   const bodyReceipt=await scoped(()=>createVideoGeneration(actor,{...base,idempotencyKey:randomUUID()})),bodyTask=await task(bodyReceipt.taskId);await dispatch(bodyTask);await finish(bodyTask.id);
   check(layout+'-body-idempotency-without-overwriting-media',()=>{assert.equal(input.received.at(-1)!.body.request_id,bodyTask.idempotencyKey);assert(!((input.received.at(-1) as {key?:string}).key));});
   bodyConfig.providers[0].options!.idempotencyBodyField=layout==='gemini'?'parameters':'input_reference';await publish(bodyConfig);
   const conflictReceipt=await scoped(()=>createVideoGeneration(actor,{...base,idempotencyKey:randomUUID()})),conflictTask=await task(conflictReceipt.taskId),beforeConflict=input.posts();try{await dispatch(conflictTask);}catch(e){await handleVideoCreationError(actor,conflictTask,e);}
   const conflictSaved=await task(conflictTask.id);check(layout+'-body-idempotency-never-overwrites-frozen-fields',()=>{assert.equal(input.posts(),beforeConflict);assert.equal(conflictSaved.status,'failed');});


  }
  console.log(`VIDEO_COMPILED_NATIVE=PASS CASES=${cases} LAYOUTS=3 REAL_PG=true REAL_HTTP_MULTIPART=true REAL_INLINE_BYTES=true PAID_CALLS=0`);
 }finally{input.setMode('ok');await publish(original.config);}
}
