import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createModelFixture} from './model-config-fixture';
import type {VideoExecutionDraft,VideoResult} from '../src/lib/video/execution-contract';

async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
  const dbUrl=new URL(process.env.DATABASE_URL!);assert.equal(dbUrl.hostname,'127.0.0.1');assert.match(dbUrl.pathname,/fixture/);
  assert.equal(process.env.STORAGE_DRIVER,'local');assert(process.env.MEDIA_DIR&&path.isAbsolute(process.env.MEDIA_DIR));
  let http=0,cases=0;
  const f=await createModelFixture((_req,res)=>{http++;res.writeHead(500);res.end('No supplier requests permitted');});
  process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS=f.origin;
  const originalFetch=globalThis.fetch;globalThis.fetch=(async()=>{http++;throw new Error('No network permitted');}) as typeof fetch;
  let pool:import('pg').Pool|undefined;
  const check=(name:string,run:()=>unknown)=>{run();cases++;console.log(`CASE=${name} PASS`);};
  const code=<T>(r:VideoResult<T>)=>r.ok?'OK':r.diagnostics[0].code;
  const value=<T>(r:VideoResult<T>):T=>{assert(r.ok,JSON.stringify(r));return r.value;};
  try{
    const {validateModelConfig}=await import('../src/lib/model-config/schema');
    const {publicModelCatalog}=await import('../src/lib/model-config/public-catalog');
    const {compatiblePublicModels}=await import('../src/lib/model-config/feature-model-policy');
    const {freezeManagedVideoCapability}=await import('../src/lib/video/frozen-capability');
    const {publishedVideoExecutionSchema}=await import('../src/lib/video/published-execution');
    const mapping=publishedVideoExecutionSchema.parse({schemaVersion:1,profileId:'json-video',profileVersion:1,recipe:{
      createPath:'/v2/video/generations',modelField:'model',promptField:'prompt',defaults:{ordinaryImage:'single_image'},
      parameters:{durationSeconds:{type:'integer',default:5,minimum:1,wireField:'duration'},resolution:{type:'string',default:'4K',mapping:{'4K':'2K'},wireMapping:{'2K':'1440p'},wireField:'resolution'}},
      operations:[{intent:'text',media:[]},{intent:'single_image',images:{min:1,max:1},media:[{kind:'image',wireField:'images',shape:'urls'}]},{intent:'reference',media:[{kind:'image',wireField:'images',shape:'urls'}]}],
    }});
    f.config.providers[0]={...f.config.providers[0],protocol:'apimart',options:{videoProfile:'apib-video-v2'}};
    f.config.upstreamModels[0]={...f.config.upstreamModels[0],modality:'video',model:'new-model-not-in-any-list',capabilities:{...f.config.upstreamModels[0].capabilities,verified:false,generate:false,edit:false,maxReferenceImages:3,video:{modes:['text'],limits:{images:0}}},parameterMap:{videoExecution:mapping}};
    f.config.publicModels[0]={...f.config.publicModels[0],id:'video-fixture',modality:'video',toolScope:{features:['video.generate'],defaultFor:['video.generate']}};
    f.config.bindings={'video.generate':'video-fixture'};
    check('poison-legacy-description-not-permission',()=>validateModelConfig(f.config,{trustedOrigins:[f.origin]}));
    const snapshot=await f.repo.current();
    check('published-catalog-admits-mapping',()=>assert.equal(publicModelCatalog(snapshot,'video','video.generate').models[0]?.id,'video-fixture'));
    check('explicit-provider-disable-preserved',()=>{const c=structuredClone(f.config);c.providers[0].enabled=false;assert.equal(compatiblePublicModels(c,'video.generate','video.generate').length,0);});
    check('explicit-model-disable-preserved',()=>{const c=structuredClone(f.config);c.publicModels[0].enabled=false;assert.equal(compatiblePublicModels(c,'video.generate','video.generate').length,0);});
    check('policy-needs-audit',()=>assert.equal(publishedVideoExecutionSchema.safeParse({...mapping,policy:{kind:'video.execution-policy',revision:0,restrictions:{disabled:true}}}).success,false));
    check('transport-protocol-mismatch-rejected',()=>{const c=structuredClone(f.config);c.providers[0].protocol='openai-videos';assert.throws(()=>validateModelConfig(c,{trustedOrigins:[f.origin]}));});
    const frozen=await freezeManagedVideoCapability(snapshot,snapshot.config.upstreamModels[0],snapshot.config.providers[0],f.sql);
    check('frozen-binding-not-legacy-caps',()=>{assert.deepEqual(frozen.definition,{});assert.deepEqual(frozen.sources,{});assert.equal(frozen.execution?.modelVersion,snapshot.version);assert.equal(frozen.execution?.modelDigest,snapshot.digest);assert.equal(frozen.execution?.policy,undefined);});
    const draft=await f.repo.draft('fixture-admin'),changed=structuredClone(draft.config);
    (changed.upstreamModels[0].parameterMap.videoExecution!.recipe as import('zod').infer<typeof import('../src/lib/video/profiles/json-profile').jsonVideoRecipeSchema>).createPath='/v3/new-request';
    const saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:changed,actor:'fixture-admin'});
    const publication=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:snapshot.version,actor:'fixture-admin',reason:'fixture published mapping revision'});
    const next=await f.repo.markApplied(publication.id,publication.digest,saved.id);
    check('published-mapping-roundtrip',()=>assert.equal((next.config.upstreamModels[0].parameterMap.videoExecution?.recipe as import('zod').infer<typeof import('../src/lib/video/profiles/json-profile').jsonVideoRecipeSchema>)?.createPath,'/v3/new-request'));
    check('historical-binding-immutable',()=>assert.equal((frozen.execution?.recipe as import('zod').infer<typeof import('../src/lib/video/profiles/json-profile').jsonVideoRecipeSchema>)?.createPath,'/v2/video/generations'));
    const old=await f.repo.byVersion(snapshot.version);check('historical-published-version-retained',()=>assert.deepEqual(old.config.upstreamModels[0].parameterMap.videoExecution,mapping));
    await f.sql.query("UPDATE app_video_model_defaults SET value=jsonb_set(value,'{execution,modelDigest}',to_jsonb($2::text)) WHERE model_version=$1",[snapshot.version,'0'.repeat(64)]);
    await assert.rejects(()=>freezeManagedVideoCapability(snapshot,snapshot.config.upstreamModels[0],snapshot.config.providers[0],f.sql),{code:'EXECUTION_MISMATCH'});cases++;console.log('CASE=frozen-revision-tamper PASS');
    await f.sql.query('UPDATE app_video_model_defaults SET value=$2::jsonb WHERE model_version=$1',[snapshot.version,JSON.stringify(frozen)]);
    const db=await import('../src/lib/db');pool=db.getPool();assert.equal((await pool.query('SELECT current_schema() AS s')).rows[0].s,f.schemaName);await db.ensureSchema();
    const {getModelExecutor}=await import('../src/lib/model-config/execution');
    const {getModelExecutionServices}=await import('../src/lib/model-config/execution-services');
    const executor=await getModelExecutor(),billing=await getModelExecutionServices().billing.current();
    const execution=await executor.resolve({binding:'video.generate',feature:'video.generate',requestedModelId:'video-fixture',snapshot:next,billing});
    const restored=await executor.describe(execution);check('real-executor-restores-published-binding',()=>assert.equal(restored.connection.wireModel,'new-model-not-in-any-list'));
    const poisoned=structuredClone(execution);(poisoned.video!.execution!.recipe as import('zod').infer<typeof import('../src/lib/video/profiles/json-profile').jsonVideoRecipeSchema>).createPath='/forged-request';
    await assert.rejects(()=>executor.describe(poisoned),{code:'EXECUTION_MISMATCH'});cases++;console.log('CASE=executor-rejects-changed-frozen-recipe PASS');
    const {ensureVideoNodeSchema}=await import('../src/lib/canvas/storage-schema');await ensureVideoNodeSchema();
    const {ensureCreationSchema}=await import('../src/lib/saas/creation-schema');await ensureCreationSchema();
    const {registerMediaAsset}=await import('../src/lib/media-assets');
    const {prepareVideoExecutionInputs}=await import('../src/lib/video/prepare-inputs');
    const {prepareVideoExecution}=await import('../src/lib/video/prepare-execution');
    const {withFrozenCreation}=await import('../src/lib/saas/creation-scope');
    const actor='video@fixture.test',other='other@fixture.test',project='tree:fixture-root';
    const png=await sharp({create:{width:17,height:13,channels:3,background:'#abcdef'}}).png().toBuffer(),sha=createHash('sha256').update(png).digest('hex');
    const key=`video-compiler-fixture/${f.schemaName}.png`;
    await mkdir(path.join(process.env.MEDIA_DIR!,path.dirname(key)),{recursive:true});await writeFile(path.join(process.env.MEDIA_DIR!,key),png);await registerMediaAsset(key,png,'image/png',false,actor,false);
    const art=async(id:string,email=actor,status='completed',url=`/media/${key}`)=>pool!.query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient) VALUES($1,$2,'fixture','image','fixture',$3,$4,'')",[id,email,status,url]);
    await art('image-owned');await art('image-other',other);await art('image-pending',actor,'generating');
    await pool.query("INSERT INTO app_canvas_video_nodes(email,id,project_key,last_result_id,display_result_id,last_task_id) VALUES($1,'native-video',$2,'image-pending','image-owned','new-running-task')",[actor,project]);
    await pool.query("INSERT INTO app_canvas_text_nodes(id,email,project_key,title,prompt,content,status) VALUES('text-owned',$1,$2,'fixture','AI instruction','actual linked content','completed'),('text-pending',$1,$2,'fixture','','not done','generating')",[actor,project]);
    const base:VideoExecutionDraft={prompt:'Turn slowly',parameters:{},legacyMode:'text',inputs:[{id:'in-1',nodeId:'image-owned',kind:'image',role:'reference',value:'https://untrusted.invalid/forged.jpg'}]};
    const prepared=value(await prepareVideoExecutionInputs(actor,project,base));
    check('real-media-hash-mime-dimensions',()=>{const i=prepared.inputs[0];assert(i.kind==='image');assert.deepEqual([i.asset.sha256,i.asset.bytes,i.asset.mimeType,i.asset.width,i.asset.height],[sha,png.length,'image/png',17,13]);assert.equal(prepared.scope.workspaceId,'personal');});
    const compiled=value(await prepareVideoExecution({actor,projectKey:project,draft:base,execution:frozen.execution,identity:{publicModelId:'video-fixture',wireModel:'new-model-not-in-any-list',connectionId:'p1'}}));
    check('legacy-text-image-auto-and-single-mapping',()=>{assert.equal(compiled.intent,'single_image');assert.equal(compiled.billingFacts.resolution,'2K');assert.equal((compiled.wireTemplate.body as Record<string,unknown>).resolution,'1440p');assert.equal(compiled.requestedParameters.resolution,undefined);assert(!JSON.stringify(compiled).includes('untrusted.invalid'));});
    check('decode-cache-hash-bound',()=>assert.equal((prepared.inputs[0] as {asset:{sha256:string}}).asset.sha256,sha));
    const rerun=value(await prepareVideoExecution({actor,projectKey:project,draft:base,execution:frozen.execution,identity:{publicModelId:'video-fixture',wireModel:'new-model-not-in-any-list',connectionId:'p1'}}));
    check('same-draft-deterministic-plan',()=>assert.equal(rerun.digest,compiled.digest));
    const cached=(await pool.query('SELECT decoder_version,probe FROM app_video_media_probes WHERE storage_key=$1 AND sha256=$2',[key,sha])).rows[0];
    check('full-static-decode-cache',()=>assert.equal(cached.decoder_version,1));
    const resolve=async(patch:Partial<VideoExecutionDraft>,projectKey:string|null=project)=>prepareVideoExecutionInputs(actor,projectKey,{...structuredClone(base),...patch});
    const selected=value(await resolve({inputs:[{...base.inputs[0],nodeId:'native-video'}]}));
    check('selected-history-not-current-task',()=>{assert(selected.inputs[0].kind==='image');assert.equal(selected.inputs[0].asset.artworkId,'image-owned');});
    // A previous result is not the output of the currently pending operation.
    // Only an explicit history selection may bind that result while it runs.
    const {createVideoTask}=await import('../src/lib/video/task-repository');
    await createVideoTask({id:'dependency-current',email:actor,upstreamId:'fixture-existing-receipt',model:'fixture',prompt:'pending dependency',size:'',seconds:'1',cost:0,requestBody:''});
    await pool.query("UPDATE app_canvas_video_nodes SET last_result_id='image-owned',display_result_id=NULL,last_task_id='dependency-current' WHERE id='native-video'");
    for(const status of ['queued','processing','needs_attention','failed','cancelled']){
      await pool.query('UPDATE app_video_tasks SET status=$1 WHERE id=$2',[status,'dependency-current']);
      const implicit=await resolve({inputs:[{...base.inputs[0],nodeId:'native-video'}]});
      check('implicit-old-result-not-'+status+'-output',()=>assert.equal(code(implicit),'DEPENDENCY_PENDING'));
      await pool.query("UPDATE app_canvas_video_nodes SET display_result_id='image-owned' WHERE id='native-video'");
      const explicit=value(await resolve({inputs:[{...base.inputs[0],nodeId:'native-video'}]}));
      check('explicit-history-usable-during-'+status,()=>{assert(explicit.inputs[0].kind==='image');assert.equal(explicit.inputs[0].asset.artworkId,'image-owned');});
      await pool.query("UPDATE app_canvas_video_nodes SET display_result_id=NULL WHERE id='native-video'");
    }
    await pool.query("UPDATE app_video_tasks SET status='completed' WHERE id='dependency-current'");
    const currentResult=value(await resolve({inputs:[{...base.inputs[0],nodeId:'native-video'}]}));
    check('completed-current-result-usable',()=>{assert(currentResult.inputs[0].kind==='image');assert.equal(currentResult.inputs[0].asset.artworkId,'image-owned');});
    await pool.query("INSERT INTO app_canvas_video_task_sends(email,task_id,project_key,result) VALUES($1,'dependency-current',$2,$3)",[actor,project,JSON.stringify({nodeId:'native-video'})]);
    const {listVideoTaskViews}=await import('../src/lib/video/queries');
    const originalTaskParameters=(await pool.query("SELECT parameters FROM app_video_tasks WHERE id='dependency-current'")).rows[0].parameters;
    assert((await listVideoTaskViews(actor,{projectKey:project})).some(task=>task.id==='dependency-current'),'sent completed task must resolve in target project without rewriting frozen projectKey');
    assert((await listVideoTaskViews(actor,{projectKey:project,nodeId:'native-video'})).some(task=>task.id==='dependency-current'));
    check('sent-history-in-target-project',()=>{});
    assert.equal((await listVideoTaskViews(actor,{projectKey:'tree:not-sent'})).length,0);
    assert.equal((await listVideoTaskViews(other,{projectKey:project})).length,0);
    assert.equal((await listVideoTaskViews(actor,{projectKey:project,status:'queued'})).length,0);
    assert.equal((await listVideoTaskViews(actor,{projectKey:project,nodeId:'not-this-node'})).length,0);
    assert.equal((await listVideoTaskViews(actor,{projectKey:project,source:'workbench'})).length,0);
    assert.equal((await listVideoTaskViews(actor,{projectKey:project,cursor:{createdAt:'2000-01-01T00:00:00Z',id:'before-all'}})).length,0);
    await pool.query("UPDATE app_video_tasks SET parameters=jsonb_build_object('projectKey',$1::text,'nodeId','native-video') WHERE id='dependency-current'",[project]);
    assert.equal((await listVideoTaskViews(actor,{projectKey:project})).filter(task=>task.id==='dependency-current').length,1);
    await pool.query("UPDATE app_video_tasks SET parameters=$1::jsonb WHERE id='dependency-current'",[originalTaskParameters]);
    check('sent-history-cursor-source-and-original-project-no-duplicates',()=>{});
    await pool.query("UPDATE app_canvas_video_nodes SET deleted_at=now() WHERE id='native-video'");
    assert.equal((await listVideoTaskViews(actor,{projectKey:project})).length,0);
    await pool.query("UPDATE app_canvas_video_nodes SET deleted_at=NULL WHERE id='native-video'");
    check('sent-history-filters-owner-node-status-and-deletion',()=>{});
    assert.deepEqual((await pool.query("SELECT parameters FROM app_video_tasks WHERE id='dependency-current'")).rows[0].parameters,originalTaskParameters);
    await pool.query("DELETE FROM app_canvas_video_task_sends WHERE task_id='dependency-current'");
    await pool.query("DELETE FROM app_video_tasks WHERE id='dependency-current'");
    const linked=value(await resolve({inputs:[{id:'text',nodeId:'text:text-owned',kind:'text',role:'context',value:'forged text'}]}));
    check('linked-text-reread-not-client',()=>{assert(linked.inputs[0].kind==='text');assert.equal(linked.inputs[0].text,'actual linked content');});
    for(const [name,patch,expected]of [
      ['other-user',{inputs:[{...base.inputs[0],nodeId:'image-other'}]},'VIDEO_INPUT_UNAVAILABLE'],
      ['pending-media',{inputs:[{...base.inputs[0],nodeId:'image-pending'}]},'DEPENDENCY_PENDING'],
      ['pending-text',{inputs:[{id:'t',nodeId:'text-pending',kind:'text',role:'context'}]},'DEPENDENCY_PENDING'],
      ['duplicate-id',{inputs:[base.inputs[0],base.inputs[0]]},'DUPLICATE_INPUT'],
      ['role-type',{inputs:[{...base.inputs[0],role:'source_video'}]},'INPUT_ROLE_MISMATCH'],
      ['claimed-video-is-image',{inputs:[{...base.inputs[0],kind:'video',role:'reference'}]},'INVALID_MEDIA_FACTS'],
    ] satisfies [string,Partial<VideoExecutionDraft>,string][]){const result=await resolve(patch);check(name,()=>assert.equal(code(result),expected));}
    const workbench=value(await resolve({},null));check('workbench-without-project',()=>assert.equal(workbench.scope.projectKey,null));
    const missing=await resolve({},'tree:not-owned');check('project-ownership',()=>assert.equal(code(missing),'VIDEO_PROJECT_UNAVAILABLE'));
    const mismatch=await withFrozenCreation({actorEmail:other,scopeKind:'personal',tenantId:null},()=>resolve({}));check('actor-scope-mismatch',()=>assert.equal(code(mismatch),'VIDEO_SCOPE_MISMATCH'));
    const tenant=randomUUID();await pool.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project','tree:tenant-source','tenant',$2),($1,'media','image-owned','tenant',$2)",[actor,tenant]);
    const mediaDenied=await resolve({},null);check('no-context-tenant-media-denied',()=>assert.equal(code(mediaDenied),'VIDEO_SCOPE_MISMATCH'));
    await pool.query("DELETE FROM app_creation_contexts WHERE context_kind='media'");
    await pool.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'media',$2,'tenant',$3)",[actor,`/media/${key}`,tenant]);
    const uploadDenied=await resolve({},null);check('canonical-upload-workspace-denied',()=>assert.equal(code(uploadDenied),'VIDEO_SCOPE_MISMATCH'));
    await pool.query("DELETE FROM app_creation_contexts WHERE context_kind='media'");
    await pool.query("UPDATE app_canvas_text_nodes SET project_key='tree:tenant-source' WHERE id='text-owned'");
    const textDenied=await resolve({inputs:[{id:'t',nodeId:'text-owned',kind:'text',role:'context'}]},null);check('cross-tenant-text-denied',()=>assert.equal(code(textDenied),'VIDEO_SCOPE_MISMATCH'));
    const deniedMapping={...frozen.execution!,policy:{kind:'video.execution-policy' as const,revision:1,restrictions:{disabled:true},audit:{actor:'admin',reason:'explicit operation',changedAt:'2026-11-14T00:00:00Z'}}};
    const denied=await prepareVideoExecution({actor,projectKey:project,draft:base,execution:deniedMapping,identity:{publicModelId:'video-fixture',wireModel:'wire',connectionId:'p1'}});check('explicit-policy-still-enforced',()=>assert.equal(code(denied),'EXECUTION_POLICY_DISABLED'));
    const badIdentity=await prepareVideoExecution({actor,projectKey:null,draft:base,execution:frozen.execution,identity:{publicModelId:'',wireModel:'wire',connectionId:'p1'}});check('invalid-binding-structured-error',()=>assert.equal(code(badIdentity),'INVALID_VIDEO_BINDING'));
    // Actual Route export, native signed session, model executor, scoped resolver
    // and real DB/media. No module mocks; no Next listener/browser claimed.
    await pool.query("INSERT INTO app_users(email,name,plan,renews_at) VALUES($1,'fixture','starter',now()+interval '1 day')",[actor]);
    const {signUserSession,USER_COOKIE}=await import('../src/lib/native-auth');
    const {POST}=await import('../src/app/api/video/compile-preview/route');
    const cookie=`${USER_COOKIE}=${signUserSession(actor,Date.now())}`;
    const request=(body:unknown,headers:Record<string,string>={cookie})=>new Request('http://127.0.0.1/api/video/compile-preview',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
    const previewBody={modelId:'video-fixture',projectKey:project,draft:base,draftRevision:7};
    const anon=await POST(request(previewBody,{}));check('route-anonymous-denied',()=>assert.equal(anon.status,401));
    const cross=await POST(request(previewBody,{cookie,origin:'http://other.invalid'}));check('route-cross-origin-denied',()=>assert.equal(cross.status,403));
    const response=await POST(request(previewBody)),payload=await response.json();
    check('route-real-authenticated-preview',()=>{assert.equal(response.status,200,JSON.stringify(payload));assert.equal(payload.value.intent,'single_image');assert.equal(payload.value.draftRevision,7);assert.equal(payload.value.modelVersion,next.version);assert.equal(payload.value.billingFacts.resolution,'2K');assert.equal(response.headers.get('cache-control'),'private, no-store');});
    check('route-no-internal-plan-leak',()=>{for(const term of ['wireTemplate','wireModel','connectionId','recipe','storageKey',f.marker])assert(!JSON.stringify(payload).includes(term),term);});
    const untrustedPlan=await POST(request({...previewBody,execution:frozen.execution}));check('route-client-binding-rejected',()=>assert.equal(untrustedPlan.status,422));
    const explicitConflict=await POST(request({...previewBody,draft:{...base,intentPreference:'text'}})),conflict=await explicitConflict.json();check('route-explicit-preference-not-dropped',()=>{assert.equal(explicitConflict.status,422);assert.equal(conflict.diagnostics[0].code,'TEXT_INTENT_HAS_MEDIA');});
    if(process.argv.includes('--ui'))await (await import('./video-compiler-ui-checks')).verifyVideoCompilerUi({snapshot:next,actor,pool,draft:base,cookie,check});
    await writeFile(path.join(process.env.MEDIA_DIR!,key),Buffer.from('changed bytes'));
    const changedBytes=await resolve({},null);check('real-byte-mutation-rejected',()=>assert.equal(code(changedBytes),'MEDIA_INPUT_CHANGED'));await writeFile(path.join(process.env.MEDIA_DIR!,key),png);
    const {saveFeaturePolicy}=await import('../src/lib/feature-access/repository');
    await saveFeaturePolicy('fixture-admin',{id:randomUUID(),email:actor,mode:'custom',allowed:[],expectedVersion:0});
    const revoked=await POST(request(previewBody));check('route-revoked-feature-denied',()=>assert.equal(revoked.status,403));
    check('preview-zero-acceptance',()=>assert.equal(http,0));
    for(const table of ['app_gen_reservations','app_creation_records','app_video_tasks']){if((await pool.query('SELECT to_regclass($1) AS t',[table])).rows[0].t)assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);}
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM app_creation_contexts WHERE context_id=$1",[project])).rows[0].n,0,'preview does not create project binding');
    console.log(`VIDEO_PUBLISHED_EXECUTION=PASS CASES=${cases} REAL_PG=true REAL_PNG_DECODE=true RESERVATIONS=0 TASKS=0 CREATIONS=0 SUPPLIER_HTTP=${http} PRODUCTION_WRITES=0 PAID_CALLS=0`);
  }finally{globalThis.fetch=originalFetch;await pool?.end();await f.cleanup();console.log('CLEANUP=PASS own_schema_dropped=true pools_closed=true');}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
