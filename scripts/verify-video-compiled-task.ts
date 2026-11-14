import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import sharp from 'sharp';
import {createModelFixture} from './model-config-fixture';
import {stopFixtureChild} from './video-fusion/process-lifecycle';
import type {CreateVideoInput} from '../src/lib/video/submission-types';
import type {VideoTaskRow} from '../src/lib/video/task-types';

async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const database=new URL(process.env.DATABASE_URL!);assert.equal(database.hostname,'127.0.0.1');assert.match(database.pathname,/fixture/);
  assert.equal(process.env.STORAGE_DRIVER,'local');assert(process.env.MEDIA_DIR&&path.isAbsolute(process.env.MEDIA_DIR));
  const root=path.resolve(process.env.MEDIA_DIR!,'../compiled-task-'+randomUUID());await mkdir(root,{recursive:true});process.env.MEDIA_DIR=path.join(root,'media');process.env.MEDIA_JOB_DIR=path.join(root,'jobs');
  process.env.MEDIA_PRIVATE='1';process.env.MEDIA_REMOTE_ACCESS='proxy';process.env.VIDEO_REFERENCE_PUBLIC_BASE_URL='https://fixture-media.example';process.env.NAUMI_VIDEO_WORKER='0';process.env.NAUMI_APPLICATION_TASK_EXECUTION='worker';
  let mode:'ok'|'disconnect'|'reject'='ok',posts=0,polls=0,downloads=0,cases=0;
  const family={enabled:false,layout:'',direct:false,received:[] as Array<{phase:string;path:string;body?:Record<string,any>;key?:string;xkey?:string}>};
  const byoc={posts:0,uploads:0,objects:0,mode:'ok',received:[] as any[],uploadHashes:[] as string[]};
  const received:Array<{path:string;body:Record<string,any>;key:string|undefined}>=[];
  const mp4file=path.join(root,'output.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=64x64:r=10','-t','1','-c:v','libx264','-pix_fmt','yuv420p',mp4file],{windowsHide:true});const mp4=await readFile(mp4file);
  const f=await createModelFixture(async(req,res)=>{
    if(req.url==='/object_info'){byoc.objects++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({LoadImage:{},CLIPTextEncode:{},SaveVideo:{},KSampler:{}}));return;}
    if(req.url==='/upload/image'||req.url==='/task/openapi/upload'){
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const form=await new Response(Buffer.concat(chunks),{headers:{'content-type':String(req.headers['content-type'])}}).formData();const file=form.get(req.url==='/upload/image'?'image':'file') as File;assert(file&&file.size>0);byoc.uploadHashes.push(createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'));byoc.uploads++;
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(req.url==='/upload/image'?{name:byoc.mode==='bad-upload'?'../bad.png':file.name,subfolder:'uploads'}:{code:0,data:{fileName:'uploads/'+file.name}}));return;
    }
    if(req.url==='/prompt'||req.url==='/task/openapi/create'||req.method==='POST'&&req.url?.startsWith('/api/v1/comfyui/comfyui_workflow/')){
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString());byoc.posts++;byoc.received.push({path:req.url,body});
      if(byoc.mode==='disconnect'){req.socket.destroy();return;}
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(req.url==='/prompt'?{prompt_id:'comfy-'+byoc.posts}:req.url==='/task/openapi/create'?{code:0,data:{taskId:'rh-'+byoc.posts}}:{code:'success',data:{task_id:'auto-'+byoc.posts,status:'queued'}}));return;
    }
    if(req.url?.startsWith('/history/')){const id=req.url.slice('/history/'.length);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({[id]:{status:{completed:true},outputs:{save:{videos:[{filename:'out.mp4',type:'output',subfolder:''}]}}}}));return;}
    if(req.url==='/task/openapi/outputs'){for await(const _ of req){}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({code:0,data:[{fileType:'mp4',fileUrl:f.origin+'/result.mp4'}]}));return;}
    if(req.url?.startsWith('/api/v1/comfyui/comfyui_workflow/result/')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({code:'success',data:{status:'completed',results:[{type:'video',url:f.origin+'/result.mp4'}]}}));return;}
    if(req.url?.startsWith('/view?')){res.writeHead(200,{'content-type':'video/mp4'});res.end(mp4);return;}
    if(family.enabled&&req.method==='POST'){
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString());posts++;family.received.push({phase:'create',path:req.url!,body,key:req.headers['idempotency-key'] as string|undefined,xkey:req.headers['x-idempotency-key'] as string|undefined});
      if(mode==='disconnect'){req.socket.destroy();return;}
      if(mode==='reject'){res.writeHead(422,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'family rejected input'}}));return;}
      const id=family.layout==='agnes'?'video_'+posts:'family-'+posts;
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(family.layout==='gemini'?{name:'operations/'+id}:['minimax','metaso'].includes(family.layout)?{task:{id,status:'queued'}}:{id,status:'queued'}));return;
    }
    if(family.enabled&&req.method==='GET'&&req.url!=='/result.mp4'){
      polls++;family.received.push({phase:'poll',path:req.url!});res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify(family.layout==='gemini'?{done:true,response:{generatedVideos:[{video:{uri:f.origin+'/result.mp4'}}]}}:['minimax','metaso'].includes(family.layout)?{task:{status:'succeeded',content:{url:f.origin+'/result.mp4'}}}:family.layout==='ark'?{status:'completed',content:{video_url:f.origin+'/result.mp4'}}:{status:'completed',video_url:f.origin+'/result.mp4'}));return;
    }
    if(req.method==='POST'&&(req.url?.endsWith('/videos')||req.url?.includes(':predictLongRunning'))){
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const raw=Buffer.concat(chunks);
      const multipart=String(req.headers['content-type']).startsWith('multipart/');let body:Record<string,any>;
      if(multipart){const form=await new Response(raw,{headers:{'content-type':String(req.headers['content-type'])}}).formData();body={};for(const [name,value]of form.entries())body[name]=typeof value==='string'?value:{name:value.name,mimeType:value.type,bytes:value.size,sha256:createHash('sha256').update(Buffer.from(await value.arrayBuffer())).digest('hex')};}
      else body=JSON.parse(raw.toString());
      posts++;received.push({path:req.url!,body,key:req.headers['idempotency-key'] as string|undefined});
      if(mode==='disconnect'){req.socket.destroy();return;}
      if(mode==='reject'){res.writeHead(422,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'fixture rejected input'}}));return;}
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(req.url?.includes(':predictLongRunning')?{name:'operations/native-'+posts}:{id:'native-'+posts,status:'queued'}));return;
    }
    if(req.url?.includes('/operations/native-')){polls++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({done:true,response:{generatedVideos:[{video:{uri:f.origin+'/result.mp4'}}]}}));return;}
    if(req.method==='GET'&&req.url?.match(/\/videos\/native-\d+$/)){polls++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({status:'completed',video_url:f.origin+'/result.mp4'}));return;}
    if(req.url?.match(/\/videos\/native-\d+\/content$/)){downloads++;res.writeHead(200,{'content-type':'video/mp4'});res.end(mp4);return;}
    if(req.method==='POST'){
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString());posts++;received.push({path:req.url!,body,key:req.headers['idempotency-key'] as string|undefined});
      if(mode==='disconnect'){req.socket.destroy();return;}
      if(mode==='reject'){res.writeHead(422,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'fixture rejected input'}}));return;}
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{task_id:`up-${posts}`,status:'queued'}]}));return;
    }
    if(req.url?.startsWith('/v1/tasks/')){polls++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:{status:'completed',progress:100,result:{videos:[f.origin+'/result.mp4']}}}));return;}
    if(req.url==='/result.mp4'){downloads++;res.writeHead(200,{'content-type':'video/mp4'});res.end(mp4);return;}
    res.writeHead(404);res.end();
  });
  process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;process.env.MODEL_CONFIG_TRUSTED_ORIGINS=f.origin;
  process.env.NAUMI_ROUTER_MANAGEMENT_URL=f.origin;process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN='fixture-router-unused-012345678901234567890123456789';process.env.MODEL_CONFIG_ENVELOPE_SECRET='fixture-envelope-unused-012345678901234567890123456789';
  let pool:import('pg').Pool|undefined,mediaWorker:ChildProcess|undefined;
  let mediaLog='';
  const check=(name:string,run:()=>void)=>{run();cases++;console.log(`CASE=${name} PASS`);};
  const until=async(run:()=>Promise<boolean>,ms=15000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await run())return;await new Promise(r=>setTimeout(r,50));}throw new Error('fixture readiness deadline');};
  try{
    const socket=createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
    process.env.MEDIA_WORKER_ORIGIN=`http://127.0.0.1:${port}`;process.env.MEDIA_WORKER_SECRET=randomUUID()+randomUUID();
    mediaWorker=spawn(process.execPath,['services/media-worker/main.mjs'],{cwd:process.cwd(),windowsHide:true,env:{...process.env,NODE_ENV:'development',MEDIA_WORKER_FIXTURE_OWNER:'canvas-video-fusion-20261013',MEDIA_WORKER_HOST:'127.0.0.1',MEDIA_WORKER_PORT:String(port)},stdio:['ignore','pipe','pipe']});
    mediaWorker.stderr?.on('data',b=>{mediaLog+=b.toString();});
    await until(async()=>{if(mediaWorker!.exitCode!==null)throw new Error('media worker exited '+mediaLog);return fetch(process.env.MEDIA_WORKER_ORIGIN+'/health',{headers:{authorization:'Bearer '+process.env.MEDIA_WORKER_SECRET}}).then(r=>r.ok).catch(()=>false);});
    f.config.providers[0]={...f.config.providers[0],protocol:'apimart',options:{videoProfile:'apib-video-v2',idempotencyStrategy:'header'}};
    f.config.upstreamModels[0]={...f.config.upstreamModels[0],modality:'video',model:'arbitrary-new-wire-video',capabilities:{...f.config.upstreamModels[0].capabilities,verified:false,generate:false,edit:false,maxReferenceImages:0,video:{modes:['text'],limits:{images:0}}},parameterMap:{videoExecution:{schemaVersion:1,profileId:'json-video',profileVersion:1,recipe:{
      createPath:'/v1/videos/generations',modelField:'model',promptField:'prompt',defaults:{ordinaryImage:'single_image',sourceVideo:'reference'},parameters:{durationSeconds:{type:'integer',default:1,wireField:'duration'},resolution:{type:'string',default:'4K',mapping:{'4K':'2K'},wireMapping:{'2K':'2k'},wireField:'resolution'},width:{type:'integer',default:32,wireField:'width'},generateAudio:{type:'boolean',default:true,wireField:'audio'}},
      operations:[{intent:'text',media:[]},{intent:'single_image',images:{min:1,max:1},media:[{kind:'image',wireField:'image_urls',shape:'urls'}]},{intent:'reference',media:[{kind:'video',wireField:'video_urls',shape:'urls'}]}],
    }}}};
    f.config.publicModels[0]={...f.config.publicModels[0],id:'video-fixture',modality:'video',toolScope:{features:['video.generate'],defaultFor:['video.generate']}};f.config.bindings={'video.generate':'video-fixture'};
    const modelSnapshot=await f.repo.current();
    const db=await import('../src/lib/db');pool=db.getPool();await db.ensureSchema();assert.equal((await pool.query('SELECT current_schema() AS s')).rows[0].s,f.schemaName);
    const {getBillingRuntime}=await import('../src/lib/billing/runtime');const billingRuntime=await getBillingRuntime(),initial=await billingRuntime.config.current(),tariff=structuredClone(initial.config);
    tariff.switches.metering='on';tariff.features['video.generate'].pricing={mode:'fixed',credits:7};tariff.features['video.generate'].rules=[];
    const bill=await billingRuntime.config.publish({id:randomUUID(),actor:'fixture-admin',reason:'local fixture tariff',expectedVersion:initial.version,config:tariff});
    const actor='compiled-video@fixture.test';await pool.query("INSERT INTO app_users(email,name,plan,renews_at) VALUES($1,'fixture','starter',now()+interval '1 day')",[actor]);
    const {withTransaction}=await import('../src/platform/db/transaction');await withTransaction(pool,tx=>billingRuntime.service.grantTx(tx,{id:'fixture-grant',email:actor,amount:process.argv.includes('--families')?5000:500,source:'grant',reason:'isolated fixture credits',actor:'fixture-admin',fingerprint:'fixture',ledgerId:'fixture-grant-ledger',expiry:{unit:'days',value:1}}));
    const {registerMediaAsset}=await import('../src/lib/media-assets');const key='compiler-inputs/'+randomUUID()+'.png',png=await sharp({create:{width:32,height:24,channels:3,background:'#abddff'}}).png().toBuffer();await mkdir(path.join(process.env.MEDIA_DIR!,'compiler-inputs'),{recursive:true});await writeFile(path.join(process.env.MEDIA_DIR!,key),png);await registerMediaAsset(key,png,'image/png',false,actor,false);
    await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient) VALUES('input-art',$1,'fixture','image','','completed',$2,'')",[actor,`/media/${key}`]);
    const {createVideoGeneration}=await import('../src/lib/video/creation');const {getVideoTask}=await import('../src/lib/video/task-repository');
    const {withFrozenCreation}=await import('../src/lib/saas/creation-scope');const {withFrozenExecutionBundle}=await import('../src/lib/model-config/execution');
    const {submitQueuedVideoTask,handleVideoCreationError,pollAndSettle,requestFromQueuedTask}=await import('../src/lib/video/runtime');
    const {readTaskCompiledVideoPlan,compiledVideoRetryInput}=await import('../src/lib/video/compiled-task');const {videoSubmissionDraft}=await import('../src/lib/video/submission-draft');const {previewVideoExecution}=await import('../src/lib/video/compile-preview');
    const {requestVideoCancellation}=await import('../src/lib/video/cancellation');
    const creation={actorEmail:actor,scopeKind:'personal' as const,tenantId:null};
    const base:CreateVideoInput={source:'workbench',modelId:'video-fixture',prompt:'Rotate once.',seconds:'1',size:'4K',mode:'text',references:[{id:'image-1',kind:'image',role:'reference',artworkId:'input-art'}]};
    const create=(patch:Partial<CreateVideoInput>={})=>withFrozenCreation({...creation},()=>createVideoGeneration(actor,{...structuredClone(base),idempotencyKey:randomUUID(),...patch}));
    const rows=async(table:string)=>Number((await pool!.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
    const task=async(id:string)=>{const t=await getVideoTask(actor,id);assert(t);return t;};
    const inTask=<T>(t:VideoTaskRow,run:()=>Promise<T>)=>withFrozenCreation(t.parameters.creationScope as typeof creation,()=>withFrozenExecutionBundle(t.parameters.modelExecutions as never,run));
    const dispatch=async(t:VideoTaskRow)=>{process.env.NAUMI_WORKER_EXECUTION='direct';try{await inTask(t,()=>submitQueuedVideoTask(actor,t));}finally{delete process.env.NAUMI_WORKER_EXECUTION;}};
    const finish=async(id:string)=>{const before=posts;for(let attempt=0;attempt<8;attempt++){
      process.env.NAUMI_WORKER_EXECUTION='direct';try{await pool!.query('UPDATE app_video_tasks SET next_poll_at=now(),poll_lock_until=NULL WHERE id=$1',[id]);await pollAndSettle(actor,id);}finally{delete process.env.NAUMI_WORKER_EXECUTION;}
      const saved=await task(id);assert.equal(posts,before,'result retry must never repeat provider create');if(saved.status==='completed')return saved;
      assert.equal(saved.status,'processing',saved.error);console.log('RESULT_RETRY='+saved.error);await new Promise(r=>setTimeout(r,100));
    }throw new Error('result did not complete; '+mediaLog);};
    const preview=await withFrozenCreation({...creation},()=>previewVideoExecution(actor,{modelId:'video-fixture',projectKey:null,draft:videoSubmissionDraft(base),draftRevision:1}));assert(preview.ok);
    const noTaskBefore=await rows('app_video_tasks');
    await assert.rejects(()=>create({intentPreference:'text'}),{code:'TEXT_INTENT_HAS_MEDIA'});await assert.rejects(()=>create({parameters:{unmappedSetting:1}}),{code:'PARAMETER_MAPPING_MISSING'});
    check('compile-errors-have-zero-task-or-reservation',()=>assert.equal(posts,0));assert.equal(await rows('app_video_tasks'),noTaskBefore);assert.equal(await rows('app_gen_reservations'),0);
    const receipt=await create(),queued=await task(receipt.taskId),plan=readTaskCompiledVideoPlan(actor,queued);
    check('real-acceptance-without-old-capability-veto',()=>{assert.equal(queued.status,'queued');assert.equal(queued.parameters.version,3);assert.equal(receipt.cost,7);assert.equal(posts,0);assert.equal(plan.intent,'single_image');assert.equal(plan.digest,preview.value.planDigest);assert.equal(queued.billingQuote?.facts.resolution,'2K');assert.equal(queued.seconds,'1');});
    check('encrypted-frozen-plan-no-expiring-url',()=>{assert.equal(typeof queued.parameters.compiledPlanEnc,'string');assert(!JSON.stringify(plan).includes('https://'));assert(!JSON.stringify(queued.parameters).includes('$videoAsset'));});
    const reservations=()=>pool!.query('SELECT count(*)::int AS n FROM app_gen_reservations');const reservationCount=(await reservations()).rows[0].n;check('reservation-created-once',()=>assert.equal(reservationCount,1));
    // Publish a different latest binding and tariff after acceptance. Dispatch
    // and settlement must continue the old immutable operation.
    const draft=await f.repo.draft('fixture-admin'),changed=structuredClone(draft.config);(changed.upstreamModels[0].parameterMap.videoExecution!.recipe as import('zod').infer<typeof import('../src/lib/video/profiles/json-profile').jsonVideoRecipeSchema>).createPath='/v1/changed-new-operation';
    const saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,actor:'fixture-admin',config:changed}),publication=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:modelSnapshot.version,actor:'fixture-admin',reason:'fixture next binding'});await f.repo.markApplied(publication.id,publication.digest,saved.id);
    const newTariff=structuredClone(bill.config);newTariff.features['video.generate'].pricing={mode:'fixed',credits:9};await billingRuntime.config.publish({id:randomUUID(),actor:'fixture-admin',reason:'fixture new tariff',expectedVersion:bill.version,config:newTariff});
    await dispatch(queued);const processing=await task(queued.id);
    check('worker-sends-old-template-no-codec-recompile',()=>{assert.equal(processing.status,'processing');assert.equal(posts,1);assert.equal(received[0].path,'/v1/videos/generations');assert.equal(received[0].body.model,'arbitrary-new-wire-video');assert.equal(received[0].body.resolution,'2k');assert.equal(received[0].body.duration,1);assert.equal(received[0].key,queued.idempotencyKey);assert.equal(processing.billingQuote?.configVersion,bill.version);assert.equal(readTaskCompiledVideoPlan(actor,processing).digest,plan.digest);});
    const {verifyVideoReferenceToken}=await import('../src/lib/video/reference-media-token');const signed=new URL(received[0].body.image_urls[0]);const token=signed.pathname.split('/').pop()!.replace(/\.png$/,'');
    check('execution-only-real-asset-signature',()=>assert.equal(verifyVideoReferenceToken(token)?.sha256,createHash('sha256').update(png).digest('hex')));
    const {materializeCompiledVideoTask}=await import('../src/lib/video/compiled-materialization');
    const [refreshA,refreshB]=await inTask(processing,async()=>[await materializeCompiledVideoTask(actor,processing),await materializeCompiledVideoTask(actor,processing)]);
    check('fresh-media-address-without-new-plan-or-post',()=>{assert.notEqual((refreshA.body as any).image_urls[0],(refreshB.body as any).image_urls[0]);assert.equal(readTaskCompiledVideoPlan(actor,processing).digest,plan.digest);assert.equal(posts,1);});
    // Execute the same Worker poll/asset/billing owners, with an actual isolated
    // media-worker process and native ffmpeg decode (fixture sandbox mode).
    const completed=await finish(queued.id);
    check('real-result-storage-lineage-ledger',()=>{assert.equal(completed.status,'completed',completed.error);assert(polls>=1);assert(downloads>=1);assert.equal(completed.parameters.resultAssets instanceof Array,true);});
    check('v3-result-observations-use-frozen-effective-facts',()=>{
      const warnings=completed.parameters.resultMetadataWarnings as Array<{code:string;expected:unknown;actual:unknown}>;
      assert(warnings.some(w=>w.code==='width_mismatch'&&w.expected===32&&w.actual===64));assert(warnings.some(w=>w.code==='missing_audio'&&w.expected===true));
    });
    const output=(completed.parameters.resultAssets as any[])[0];assert.equal(createHash('sha256').update(await readFile(path.join(process.env.MEDIA_DIR!,output.storageKey))).digest('hex'),output.sha256);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_ledger WHERE id=$1',[`led-video-${queued.id}`])).rows[0].n,1);assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_gen_reservations WHERE job_id=$1',[queued.id])).rows[0].n,0);
    const artwork=(await pool.query('SELECT parent_id FROM app_artworks WHERE id=$1',[completed.artworkId])).rows[0];assert.equal(artwork.parent_id,'input-art');
    const count=posts;process.env.NAUMI_WORKER_EXECUTION='direct';try{await pollAndSettle(actor,queued.id);}finally{delete process.env.NAUMI_WORKER_EXECUTION;}check('completed-recovery-no-repost',()=>assert.equal(posts,count));
    const keyConcurrent=randomUUID(),concurrent=await Promise.all([create({idempotencyKey:keyConcurrent}),create({idempotencyKey:keyConcurrent}),create({idempotencyKey:keyConcurrent})]);
    check('concurrent-acceptance-one-receipt',()=>{assert.equal(new Set(concurrent.map(r=>r.taskId)).size,1);assert.equal(concurrent[0].cost,9);});
    const ctask=await task(concurrent[0].taskId),before=posts;process.env.NAUMI_WORKER_EXECUTION='direct';let results:PromiseSettledResult<void>[];
    try{results=await Promise.allSettled([inTask(ctask,()=>submitQueuedVideoTask(actor,ctask)),inTask(ctask,()=>submitQueuedVideoTask(actor,ctask))]);}finally{delete process.env.NAUMI_WORKER_EXECUTION;}
    check('row-lock-prevents-double-create',()=>{assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(posts,before+1);assert.equal(received.at(-1)?.path,'/v1/changed-new-operation');});
    await assert.rejects(()=>create({idempotencyKey:keyConcurrent,prompt:'Different intent'}),{code:'OPERATION_CONFLICT'});cases++;console.log('CASE=operation-conflict PASS');
    const cancelReceipt=await create(),cancelTask=await task(cancelReceipt.taskId),beforeCancel=posts;await requestVideoCancellation(actor,cancelTask.id);await dispatch(cancelTask);
    check('prepared-cancel-refunds-without-dispatch',()=>assert.equal(posts,beforeCancel));assert.equal((await task(cancelTask.id)).status,'cancelled');assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_gen_reservations WHERE job_id=$1',[cancelTask.id])).rows[0].n,0);
    mode='disconnect';const unknownReceipt=await create(),unknown=await task(unknownReceipt.taskId),beforeUnknown=posts;try{await dispatch(unknown);assert.fail('Expected ambiguous upstream disconnect');}catch(error){await handleVideoCreationError(actor,unknown,error);}
    const uncertain=await task(unknown.id);check('ambiguous-acceptance-held-not-replayed',()=>{assert.equal(uncertain.status,'needs_attention');assert.equal(uncertain.errorCode,'creation_unknown');assert.equal(posts,beforeUnknown+1);assert.equal(uncertain.parameters.submissionState,'sending');});
    process.env.NAUMI_WORKER_EXECUTION='direct';try{await pollAndSettle(actor,unknown.id);}finally{delete process.env.NAUMI_WORKER_EXECUTION;}assert.equal(posts,beforeUnknown+1);assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_gen_reservations WHERE job_id=$1',[unknown.id])).rows[0].n,1);mode='ok';
    const changedReceipt=await create(),changedTask=await task(changedReceipt.taskId),beforeChanged=posts;await writeFile(path.join(process.env.MEDIA_DIR!,key),Buffer.from('changed asset'));
    try{await dispatch(changedTask);assert.fail('Expected changed bytes');}catch(error){await handleVideoCreationError(actor,changedTask,error);}await writeFile(path.join(process.env.MEDIA_DIR!,key),png);
    check('changed-asset-fails-before-post',()=>assert.equal(posts,beforeChanged));assert.equal((await task(changedTask.id)).status,'failed');
    const retryInput=compiledVideoRetryInput(actor,await task(changedTask.id));check('explicit-retry-preserves-requested-not-wire-values',()=>{assert.equal(retryInput.parameters?.resolution,'4K');assert.equal(retryInput.retryOf,changedTask.id);assert.equal(retryInput.seconds,'');assert.equal(retryInput.size,'');});
    const retry=await create({...retryInput,idempotencyKey:randomUUID()}),retryTask=await task(retry.taskId);assert.equal(readTaskCompiledVideoPlan(actor,retryTask).billingFacts.resolution,'2K');await dispatch(retryTask);assert.equal((await task(retryTask.id)).status,'processing');
    check('explicit-retry-new-operation-old-task-unchanged',()=>{assert.notEqual(retryTask.id,changedTask.id);assert.equal(retryTask.parameters.retryOf,changedTask.id);});
    const upload=await create({references:[{id:'upload-1',kind:'image',role:'reference',storageKey:key}]}),uploadTask=await task(upload.taskId);check('controlled-upload-without-artwork',()=>assert.equal(readTaskCompiledVideoPlan(actor,uploadTask).inputManifest[0].kind,'image'));
    await pool.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'media',$2,'tenant',$3)",[actor,`/media/${key}`,randomUUID()]);const beforeRevoked=posts;
    try{await dispatch(uploadTask);assert.fail('Expected revoked workspace access');}catch(error){await handleVideoCreationError(actor,uploadTask,error);}check('workspace-revocation-before-post',()=>assert.equal(posts,beforeRevoked));assert.equal((await task(uploadTask.id)).status,'failed');await pool.query("DELETE FROM app_creation_contexts WHERE context_kind='media' AND context_id=$1",[`/media/${key}`]);
    const corrupt=structuredClone(uploadTask);corrupt.parameters.compiledPlanDigest='0'.repeat(64);assert.throws(()=>requestFromQueuedTask(corrupt),{code:'INVALID_COMPILED_TASK'});cases++;console.log('CASE=corrupt-plan-no-legacy-fallback PASS');
    const projection=requestFromQueuedTask(uploadTask);check('stable-task-projection',()=>{assert.equal(projection.modelId,'arbitrary-new-wire-video');assert.equal(projection.resolution,'2K');});
    const legacy={...uploadTask,parameters:{version:2,request:{...projection,prompt:'historical exact request'}}};check('historical-v2-reader-unchanged',()=>assert.equal(requestFromQueuedTask(legacy).prompt,'historical exact request'));
    mode='reject';const bad=await create(),badTask=await task(bad.taskId);try{await dispatch(badTask);assert.fail('Expected explicit reject');}catch(error){await handleVideoCreationError(actor,badTask,error);}const rejected=await task(badTask.id);check('explicit-upstream-reject-refunds-once',()=>assert.equal(rejected.status,'failed'));assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_gen_reservations WHERE job_id=$1',[badTask.id])).rows[0].n,0);mode='ok';
    const ledger=(await pool.query('SELECT delta FROM app_ledger WHERE id=$1',[`led-video-${queued.id}`])).rows[0];check('frozen-price-settlement-not-latest-price',()=>assert.equal(Number(ledger.delta),-7));
    const {saveVideoNode}=await import('../src/lib/canvas/video-node-service');const {submitCanvasVideo}=await import('../src/lib/video/node-submission');const {getVideoNode}=await import('../src/lib/canvas/video-node-repository');
    const canvasNode=await withFrozenCreation({...creation},()=>saveVideoNode(actor,{id:'compiler-canvas',expectedRevision:0,operationId:randomUUID(),config:{modelId:'video-fixture',prompt:'Canvas turn.',mode:'text',parameters:{durationSeconds:1,resolution:'4K'}},inputs:[{id:'linked-image',nodeId:'input-art',kind:'image',role:'reference',value:'untrusted UI value'}]}));
    const {previewCanvasVideo}=await import('../src/lib/video/node-preview');
    const canvasPreview=await withFrozenCreation({...creation},()=>previewCanvasVideo(actor,canvasNode.id,{expectedRevision:canvasNode.revision,draftRevision:4}));assert(canvasPreview.ok);
    const canvasReceipt=await withFrozenCreation({...creation},()=>submitCanvasVideo(actor,{nodeId:canvasNode.id,expectedRevision:canvasNode.revision,idempotencyKey:randomUUID()})),canvasTask=await task(canvasReceipt.taskId);
    check('canvas-single-uses-new-resolver-and-compiler',()=>{assert.equal(canvasTask.parameters.version,3);assert.equal(readTaskCompiledVideoPlan(actor,canvasTask).intent,'single_image');assert.equal(canvasTask.parameters.nodeId,canvasNode.id);assert.equal(canvasPreview.value.planDigest,canvasTask.parameters.compiledPlanDigest);});
    await assert.rejects(()=>withFrozenCreation({...creation},()=>submitCanvasVideo(actor,{nodeId:canvasNode.id,expectedRevision:canvasNode.revision,idempotencyKey:randomUUID()})),{code:'VIDEO_NODE_REVISION_CONFLICT'});cases++;console.log('CASE=canvas-submission-stale-revision-still-rejected PASS');
    await dispatch(canvasTask);const canvasDone=await finish(canvasTask.id),source=await getVideoNode(actor,canvasNode.id);assert.equal(canvasDone.status,'completed',canvasDone.error);assert.equal(source?.lastResultId,canvasDone.artworkId);
    const sourceSelected=await withFrozenCreation({...creation},()=>saveVideoNode(actor,{id:canvasNode.id,expectedRevision:source!.revision,operationId:randomUUID(),config:{...source!.config,prompt:'Another task later'}}));
    await pool.query('UPDATE app_canvas_video_nodes SET display_result_id=$3,last_task_id=$4 WHERE email=$1 AND id=$2',[actor,canvasNode.id,canvasDone.artworkId,unknown.id]);
    const nextNode=await withFrozenCreation({...creation},()=>saveVideoNode(actor,{id:'compiler-downstream',expectedRevision:0,operationId:randomUUID(),config:{modelId:'video-fixture',prompt:'Continue selected result.',parameters:{durationSeconds:1,resolution:'4K'}},inputs:[{id:'selected-video',nodeId:canvasNode.id,kind:'video',role:'source_video',value:'client-forged.mp4'}]}));
    const downstream=await withFrozenCreation({...creation},()=>submitCanvasVideo(actor,{nodeId:nextNode.id,expectedRevision:nextNode.revision,idempotencyKey:randomUUID()})),downTask=await task(downstream.taskId),downPlan=readTaskCompiledVideoPlan(actor,downTask);
    check('selected-canvas-result-feeds-next-node',()=>{assert.equal(downPlan.intent,'reference');const i=downPlan.inputManifest[0];assert(i.kind==='video');assert.equal(i.asset.artworkId,canvasDone.artworkId);assert.equal(downTask.parameters.nodeId,nextNode.id);assert(sourceSelected.revision>source!.revision);});
    await dispatch(downTask);check('downstream-execution-preserves-video-input',()=>assert.equal(received.at(-1)?.body.video_urls.length,1));
    const downstreamDone=await finish(downTask.id),downNode=await getVideoNode(actor,nextNode.id),downParent=(await pool.query('SELECT parent_id FROM app_artworks WHERE id=$1',[downstreamDone.artworkId])).rows[0];
    check('downstream-result-node-lineage-and-billing-complete',()=>{assert.equal(downstreamDone.status,'completed',downstreamDone.error);assert.equal(downNode?.lastResultId,downstreamDone.artworkId);assert.equal(downParent.parent_id,canvasDone.artworkId);});assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_ledger WHERE id=$1',[`led-video-${downTask.id}`])).rows[0].n,1);
    const {signUserSession,USER_COOKIE}=await import('../src/lib/native-auth');const {POST:generate}=await import('../src/app/api/video/generate/route');const {POST:retryRoute}=await import('../src/app/api/video/tasks/[id]/retry/route');
    const cookie=`${USER_COOKIE}=${signUserSession(actor,Date.now())}`;
    const httpRequest=(url:string,body:unknown)=>new Request('http://127.0.0.1'+url,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)});
    const {POST:canvasPreviewRoute}=await import('../src/app/api/canvas/video-nodes/[id]/compile-preview/route');
    const refreshed=await getVideoNode(actor,nextNode.id),previewRouteResponse=await canvasPreviewRoute(httpRequest('/api/canvas/video-nodes/'+nextNode.id+'/compile-preview',{expectedRevision:refreshed!.revision,draftRevision:8}),{params:Promise.resolve({id:nextNode.id})}),previewPayload=await previewRouteResponse.json();
    check('actual-canvas-preview-route-owned-node',()=>{assert.equal(previewRouteResponse.status,200,JSON.stringify(previewPayload));assert.equal(previewPayload.value.draftRevision,8);assert.equal(previewPayload.value.intent,'reference');});
    const stale=await canvasPreviewRoute(httpRequest('/api/canvas/video-nodes/'+nextNode.id+'/compile-preview',{expectedRevision:nextNode.revision,draftRevision:7}),{params:Promise.resolve({id:nextNode.id})});check('canvas-preview-stale-node-cas',()=>assert.equal(stale.status,409));
    const conflictNode=await withFrozenCreation({...creation},()=>saveVideoNode(actor,{id:'compiler-conflict',expectedRevision:0,operationId:randomUUID(),config:{modelId:'video-fixture',prompt:'Transaction conflict',parameters:{durationSeconds:1,resolution:'4K'}}}));
    await pool.query("CREATE FUNCTION fixture_node_conflict() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source_id='compiler-conflict' THEN UPDATE app_canvas_video_nodes SET revision=revision+1 WHERE id='compiler-conflict'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fixture_conflict AFTER INSERT ON app_video_tasks FOR EACH ROW EXECUTE FUNCTION fixture_node_conflict()");
    const countsBefore=await Promise.all(['app_video_tasks','app_gen_reservations','app_creation_records','app_billing_operations'].map(rows));
    await assert.rejects(()=>withFrozenCreation({...creation},()=>submitCanvasVideo(actor,{nodeId:conflictNode.id,expectedRevision:conflictNode.revision,idempotencyKey:randomUUID()})),{code:'VIDEO_NODE_REVISION_CONFLICT'});
    const countsAfter=await Promise.all(['app_video_tasks','app_gen_reservations','app_creation_records','app_billing_operations'].map(rows));
    check('node-association-failure-rolls-back-task-bill-creation',()=>assert.deepEqual(countsAfter,countsBefore));assert.equal((await getVideoNode(actor,conflictNode.id))?.revision,conflictNode.revision);await pool.query('DROP TRIGGER fixture_conflict ON app_video_tasks; DROP FUNCTION fixture_node_conflict()');
    const routeBody={source:'workbench',modelId:'video-fixture',prompt:'HTTP function acceptance.',parameters:{durationSeconds:1,resolution:'4K'},idempotencyKey:randomUUID(),references:base.references};
    const routeResponse=await generate(httpRequest('/api/video/generate',routeBody)),routeResult=await routeResponse.json();check('actual-generate-route-auth-to-compiled-task',()=>assert.equal(routeResponse.status,200,JSON.stringify(routeResult)));assert.equal((await task(routeResult.taskId)).parameters.version,3);
    const retryResponse=await retryRoute(httpRequest('/api/video/tasks/'+changedTask.id+'/retry',{idempotencyKey:randomUUID()}),{params:Promise.resolve({id:changedTask.id})}),retried=await retryResponse.json();check('actual-explicit-retry-route-no-double-mapping',()=>assert.equal(retryResponse.status,202,JSON.stringify(retried)));assert.equal(readTaskCompiledVideoPlan(actor,await task(retried.taskId)).requestedParameters.resolution,'4K');
    const unknownResponse=await retryRoute(httpRequest('/api/video/tasks/'+unknown.id+'/retry',{idempotencyKey:randomUUID()}),{params:Promise.resolve({id:unknown.id})});check('unknown-task-not-new-operation-retryable',()=>assert.equal(unknownResponse.status,409));
    if(process.argv.includes('--native'))await (await import('./video-compiled-native-checks')).verifyCompiledNative({actor,pool,f,posts:()=>posts,received,task,finish,dispatch,check,key,setMode:value=>{mode=value;}});
    if(process.argv.includes('--families'))await (await import('./video-compiled-family-checks')).verifyCompiledFamilies({actor,pool,f,family,completedId:completed.id,posts:()=>posts,task,finish,dispatch,check,key,setMode:value=>{mode=value;}});
    if(process.argv.includes('--byoc'))await (await import('./video-compiled-byoc-checks')).verifyCompiledByoc({actor,pool,f,byoc,task,finish,dispatch,check,key});
    if(process.argv.includes('--structured'))await (await import('./video-compiled-structured-checks')).verifyCompiledStructured({actor,pool,f,posts:()=>posts,received,task,finish,dispatch,check});
    if(process.argv.includes('--agent')||process.argv.includes('--agent-baseline'))await (await import('./video-compiled-agent-checks')).verifyCompiledAgent({actor,pool,f,posts:()=>posts,task,finish,dispatch,completedId:completed.id,check});
    if(process.argv.includes('--workflow'))await (await import('./video-compiled-workflow-checks')).verifyCompiledWorkflow({actor,pool,f,posts:()=>posts,received,task,finish,check,setMode:value=>{mode=value;}});
    const disabledDraft=await f.repo.draft('fixture-admin'),disabledConfig=structuredClone(disabledDraft.config);disabledConfig.publicModels[0].enabled=false;disabledConfig.publicModels.push({...structuredClone(disabledConfig.publicModels[0]),id:'video-other',enabled:true});disabledConfig.publicModels[0].toolScope!.defaultFor=[];disabledConfig.bindings={'video.generate':'video-other'};const disabledSaved=await f.repo.saveDraft({id:disabledDraft.id,expectedRevision:disabledDraft.revision,actor:'fixture-admin',config:disabledConfig}),disablePublication=await f.repo.stage({id:randomUUID(),draftId:disabledSaved.id,expectedRevision:disabledSaved.revision,expectedVersion:(await f.repo.current()).version,actor:'fixture-admin',reason:'fixture explicit disable'});await f.repo.markApplied(disablePublication.id,disablePublication.digest,disabledSaved.id);
    const replayResponse=await generate(httpRequest('/api/video/generate',routeBody)),replayed=await replayResponse.json();check('accepted-http-replay-survives-new-model-disable',()=>{assert.equal(replayResponse.status,200,JSON.stringify(replayed));assert.equal(replayed.taskId,routeResult.taskId);});
    await assert.rejects(()=>create(),{code:'MODEL_UNAVAILABLE'});cases++;console.log('CASE=new-operation-still-obeys-explicit-disable PASS');
    console.log(`VIDEO_COMPILED_TASK=PASS CASES=${cases} REAL_PG=true REAL_SUPPLIER_HTTP=true REAL_MEDIA_WORKER=true REAL_FFMPEG_DECODE=true PAID_CALLS=0 PRODUCTION_WRITES=0 POSTS=${posts} POLLS=${polls} DOWNLOADS=${downloads}`);
    await writeFile(path.join(root,'RESULT.json'),JSON.stringify({ok:true,cases,posts,polls,downloads,actualWorkerFunctions:true,actualMediaWorkerProcess:true,mediaSandbox:false,actualNextServer:false,paidCalls:0,productionWrites:0,received,familyReceived:family.received},null,2));console.log('EVIDENCE='+path.join(root,'RESULT.json'));
  }finally{await stopFixtureChild(mediaWorker);await writeFile(path.join(root,'MEDIA_WORKER.log'),mediaLog);await pool?.end();await f.cleanup();console.log('CLEANUP=PASS own_schema_dropped=true pools_closed=true own_media_worker_stopped=true');}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
