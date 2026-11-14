import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createModelFixture} from './model-config-fixture';
import presets from '../src/lib/model-config/video-execution-presets.json';
import {configuredVideoProviders} from '../src/lib/video/providers/config';
import {bootstrapModelConfig} from '../src/lib/model-config/bootstrap';
import {videoProfileProtocol,type VideoWireProfile} from '../src/lib/video/capability-schema';
import {reviewVideoExecutionMigration,applyReviewedVideoExecutionMigration,rollbackVideoExecutionMigration} from '../src/lib/model-config/video-execution-migration';
import {videoExecutionReadiness} from '../src/lib/model-config/video-execution-readiness';
import {modelConfigDigest} from '../src/lib/model-config/snapshot-value';
import {freezeManagedVideoCapability} from '../src/lib/video/frozen-capability';

async function main(){
 const saved=Object.fromEntries(Object.entries(process.env).filter(([name])=>name.startsWith('VIDEO_')));
 for(const name of Object.keys(saved))delete process.env[name];
 let requests=0,cases=0;
 const f=await createModelFixture((_req,res)=>{requests++;res.writeHead(500);res.end('No upstream calls allowed in bootstrap tests');});
 const check=(name:string,run:()=>void)=>{run();cases++;console.log('ENVIRONMENT_CHECK='+name+' PASS');};
 try{
  const declared=presets.items.map((item,i)=>({id:'environment-'+i,label:'Environment '+i,protocol:videoProfileProtocol(item.profile as VideoWireProfile),
   baseUrl:f.origin+'/v1',apiKey:f.marker,models:[item.model],defaultModel:item.model,videoProfile:item.previousProfiles[0],
   timeoutMs:213000,appUrl:f.origin+'/workflow',createPath:'/custom-create',pollPath:'/custom-poll/{id}',contentPath:'/custom-content/{id}',
   rawAuthorization:true,idempotencyStrategy:'body',idempotencyBodyField:'operation_id',workflowId:'explicit-workflow'}));
  process.env.VIDEO_PROVIDERS_JSON=JSON.stringify(declared);
  const selected=configuredVideoProviders();
  const first=selected[0],importOne=await bootstrapModelConfig({credentials:f.credentials,sources:{video:[first]},trustedOrigins:[f.origin]});
  const imported=importOne.providers[0];
  if(process.argv.includes('--probe')){
   console.log('ENVIRONMENT_BOOTSTRAP_PROBE='+JSON.stringify({sourceProfile:first.videoProfile,importedProfile:imported.options?.videoProfile??null,
    sourceTimeout:first.timeoutMs,importedTimeout:imported.timeoutMs,sourceAppUrlPresent:!!first.appUrl,importedAppUrlPresent:!!imported.options?.appUrl,
    migrationStatus:reviewVideoExecutionMigration(importOne,1).rows[0].status,requests}));
   return;
  }
  check('explicit-JSON-profile-timeout-app-url-survive-import',()=>{assert.equal(imported.options?.videoProfile,first.videoProfile);assert.equal(imported.timeoutMs,first.timeoutMs);assert.equal(imported.options?.appUrl,first.appUrl);});
  // Enumerate every parser source; do not let a test-only list hide an env lane.
  process.env.VIDEO_API_BASE_URL=f.origin;process.env.VIDEO_API_KEY=f.marker;process.env.VIDEO_API_MODEL='legacy-environment-model';
  for(const prefix of ['VIDEO_ARK','VIDEO_KIE','VIDEO_APIMART','VIDEO_GEMINI','VIDEO_MINIMAX','VIDEO_AUTODL','VIDEO_RUNNINGHUB']){
   process.env[prefix+'_BASE_URL']=f.origin;process.env[prefix+'_API_KEY']=f.marker;process.env[prefix+'_MODEL']='unknown-'+prefix.toLowerCase();
  }
  const unknown={...declared[0],id:'unknown-environment',models:['future-unlisted-model'],defaultModel:'future-unlisted-model'};
  process.env.VIDEO_PROVIDERS_JSON=JSON.stringify([...declared,unknown]);
  const sources=configuredVideoProviders(),before=structuredClone(sources);
  check('all-parser-sources-enumerated',()=>{assert.equal(sources.length,41);assert.equal(sources.filter(p=>!p.videoProfile).length,8);assert.equal(sources.filter(p=>p.videoProfile).length,33);});
  process.env.VIDEO_PROVIDERS_JSON=JSON.stringify([...declared,unknown,{...declared[0],id:'apimart',defaultModel:'explicit-override',models:['explicit-override']}]);
  check('JSON-override-preserves-existing-source-precedence',()=>{const overridden=configuredVideoProviders();assert.equal(overridden.length,41);assert.equal(overridden.find(p=>p.id==='apimart')?.defaultModel,'explicit-override');assert.equal(overridden.find(p=>p.id==='apimart')?.videoProfile,first.videoProfile);});
  process.env.VIDEO_PROVIDERS_JSON=JSON.stringify([...declared,unknown]);
  const config=await bootstrapModelConfig({credentials:f.credentials,sources:{video:sources},trustedOrigins:[f.origin]});
  check('bootstrap-keeps-source-objects-and-plaintext-out-of-snapshot',()=>{assert.deepEqual(sources,before);assert(!JSON.stringify(config).includes(f.marker));assert.equal(config.providers.length,41);assert.equal(config.upstreamModels.length,41);});
  for(const source of sources)check(source.id+'-connection-preserved',()=>{
   const provider=config.providers.find(p=>p.id==='video:'+source.id)!;
   assert.equal(provider.protocol,source.protocol);assert.equal(provider.baseUrl,source.baseUrl);assert.equal(provider.timeoutMs,source.timeoutMs??120000);
   for(const key of ['createPath','pollPath','contentPath','rawAuthorization','workflowId','idempotencyStrategy','idempotencyBodyField','videoProfile','appUrl'] as const)
    assert.equal(provider.options?.[key],source[key],key);
   assert.deepEqual(config.upstreamModels.filter(u=>u.providerId===provider.id).map(u=>u.model),[...new Set([source.defaultModel,...source.models])]);
  });
  const review=reviewVideoExecutionMigration(config,1),plan=applyReviewedVideoExecutionMigration(config,1,review.reviewDigest,review.publicIds);
  check('all32-explicit-profile-seeds-reach-existing-review',()=>{assert.equal(review.publicIds.length,32);assert.equal(review.rows.filter(r=>r.status==='mapping_required').length,9);assert.equal(plan.patches.filter(p=>p.field==='parameterMap.videoExecution').length,32);});
  check('no-profile-and-new-model-require-explicit-mapping-not-name-inference',()=>{
   for(const source of sources.filter(p=>!p.videoProfile||p.id===unknown.id)){
    const upstream=config.upstreamModels.find(u=>u.providerId==='video:'+source.id)!;
    const model=config.publicModels.find(m=>m.target.id===upstream.id)!;
    assert.equal(review.rows.find(r=>r.publicId===model.id)?.status,'mapping_required');
    assert.equal(plan.config.upstreamModels.find(u=>u.id===upstream.id)!.parameterMap.videoExecution,undefined);
   }
  });
  check('explicit-import-does-not-invent-policy-price-or-capabilities',()=>{
   assert.deepEqual(plan.config.providers,config.providers);assert.deepEqual(plan.config.publicModels,config.publicModels);assert.deepEqual(plan.config.bindings,config.bindings);
   for(const u of config.upstreamModels){const after=plan.config.upstreamModels.find(v=>v.id===u.id)!;assert.deepEqual(after.capabilities,u.capabilities);assert.equal(after.parameterMap.videoExecution?.policy,undefined);assert.equal(after.costRef,u.costRef);assert.equal(after.procurement,u.procurement);}
   assert.deepEqual(rollbackVideoExecutionMigration(plan.config,plan.patches),config);
  });
  const snapshot={version:1,digest:modelConfigDigest(config),config};
  check('unmigrated-active-env-routes-remain-visible-to-readiness',()=>{assert.equal(videoExecutionReadiness(snapshot).ready,false);const r=videoExecutionReadiness({...snapshot,digest:modelConfigDigest(plan.config),config:plan.config});assert.equal(r.models,41);assert.equal(r.issues.length,9);assert(!r.ready);});
  const narrowed=structuredClone(plan.config);
  for(const m of narrowed.publicModels)if(!narrowed.upstreamModels.find(u=>u.id===m.target.id)!.parameterMap.videoExecution)m.enabled=false;
  check('only-explicitly-disabled-unmigrated-routes-are-excluded',()=>{assert(videoExecutionReadiness({...snapshot,config:narrowed,digest:modelConfigDigest(narrowed)}).ready);assert.equal(config.publicModels.filter(m=>m.enabled).length,41);});
  // Use the existing repository/publication owner and encrypted credential store.
  // No manual frozen-default writes or replacement persistence implementation.
  Object.assign(f.config,config);
  const old=await f.repo.current(),oldRows=(await f.sql.query('SELECT upstream_id,value FROM app_video_model_defaults WHERE model_version=$1 ORDER BY upstream_id',[old.version])).rows;
  const currentReview=reviewVideoExecutionMigration(old.config,old.version),currentPlan=applyReviewedVideoExecutionMigration(old.config,old.version,currentReview.reviewDigest,currentReview.publicIds);
  const draft=await f.repo.draft('fixture-admin'),changed=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,actor:'fixture-admin',config:currentPlan.config});
  const staged=await f.repo.stage({id:randomUUID(),draftId:changed.id,expectedRevision:changed.revision,expectedVersion:old.version,actor:'fixture-admin',reason:'explicit environment binding fixture'});
  const active=await f.repo.markApplied(staged.id,staged.digest,changed.id);
  check('real-publication-keeps-old-version-and-defaults',()=>{assert(active.version>old.version);assert.equal(active.config.providers.length,41);assert.deepEqual(active.config.providers,old.config.providers);});
  assert.deepEqual((await f.repo.byVersion(old.version)).config,old.config);
  assert.deepEqual((await f.sql.query('SELECT upstream_id,value FROM app_video_model_defaults WHERE model_version=$1 ORDER BY upstream_id',[old.version])).rows,oldRows);
  for(const source of selected){
   const upstream=active.config.upstreamModels.find(u=>u.providerId==='video:'+source.id)!,provider=active.config.providers.find(p=>p.id===upstream.providerId)!;
   const frozen=await freezeManagedVideoCapability(active,upstream,provider,f.sql);
   assert(frozen.execution);assert.equal(frozen.execution.modelVersion,active.version);assert.equal(frozen.execution.modelDigest,active.digest);
   assert.equal(await f.credentials.read(provider.credentialRef!,provider.id),f.marker);
  }
  check('all32-published-bindings-have-frozen-reader-and-original-credentials',()=>{assert.equal(selected.length,32);assert.equal(requests,0);});
  check('input-query-override-and-invalid-timeout-still-validated',()=>{assert.equal(imported.options?.pollPath,'/custom-poll/{id}');});
  await assert.rejects(bootstrapModelConfig({credentials:f.credentials,sources:{video:[{...first,timeoutMs:0}]},trustedOrigins:[f.origin]}),{code:'INVALID_CONFIG'});cases++;
  await assert.rejects(bootstrapModelConfig({credentials:f.credentials,sources:{video:[{...first,protocol:'ark'}]},trustedOrigins:[f.origin]}),{code:'INVALID_CONFIG'});cases++;
  await assert.rejects(bootstrapModelConfig({credentials:f.credentials,sources:{video:[{...first,appUrl:f.origin+'/workflow?key=not-an-app-origin'}]},trustedOrigins:[f.origin]}),{code:'INVALID_CONFIG'});cases++;
  console.log('VIDEO_ENVIRONMENT_BOOTSTRAP=PASS CASES='+cases+' ENV_SOURCES=41 REVIEWABLE=32 EXPLICIT_MAPPING_REQUIRED=9 REAL_PG=1 SUPPLIER_CALLS='+requests+' PRODUCTION_WRITES=0 PAID_CALLS=0');
 }finally{
  await f.cleanup();
  for(const name of Object.keys(process.env))if(name.startsWith('VIDEO_'))delete process.env[name];
  Object.assign(process.env,saved);
  console.log('VIDEO_ENVIRONMENT_CLEANUP=PASS SCHEMA_DROPPED=1 ENV_RESTORED=1');
 }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
