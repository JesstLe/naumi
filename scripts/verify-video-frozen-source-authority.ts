import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import {createModelFixture} from './model-config-fixture';
import type {VideoModelDefinition} from '../src/lib/video/capability-schema';
import type {VideoWorkflowPlan} from '../src/lib/video/workflow-schema';
import type {CreateVideoInput} from '../src/lib/video/service';

/** Focused entry regression, real isolated PG + actual application functions.
 * Only the submission execution scope is synthetic; its capability is reread
 * from PG. Workflow uses the real administration/executor/billing chain. The
 * old-code control compiles the same modules in memory, replacing ONLY the
 * sources-preserving expression; it does not edit files or stub dependencies.
 * No Router prepare, supplier execution, reservation, or full family suite.
 * Run: NAUMI_VERIFY_ISOLATED_DB=1 DATABASE_URL=<isolated-loopback-fixture>
 *      npx tsx --conditions react-server scripts/verify-video-frozen-source-authority.ts
 */
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
  const database=new URL(process.env.DATABASE_URL||'http://invalid');
  assert.equal(database.hostname,'127.0.0.1');
  assert.match(database.pathname,/^\/naumi_video_fixture_[a-z0-9_]+$/);
  let supplierPosts=0,httpRequests=0,hookPosts=0,creationErrors=0,fetchCalls=0;
  const f=await createModelFixture((req,res)=>{httpRequests++;if(req.method==='POST')supplierPosts++;res.writeHead(500);res.end('Unexpected HTTP in frozen-source regression');});
  const previousEnv={PGOPTIONS:process.env.PGOPTIONS,NAUMI_ROUTER_MANAGEMENT_URL:process.env.NAUMI_ROUTER_MANAGEMENT_URL,NAUMI_ROUTER_MANAGEMENT_TOKEN:process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN,MODEL_CONFIG_ENVELOPE_SECRET:process.env.MODEL_CONFIG_ENVELOPE_SECRET,MODEL_CONFIG_TRUSTED_ORIGINS:process.env.MODEL_CONFIG_TRUSTED_ORIGINS};
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'fixture-frozen-source-router-only',MODEL_CONFIG_ENVELOPE_SECRET:'fixture-frozen-source-envelope-only',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin});
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(async()=>{fetchCalls++;throw new Error('Unexpected fetch in frozen-source regression');}) as typeof fetch;
  let pool:ReturnType<(typeof import('../src/lib/db'))['getPool']>|undefined;
  const sourcePaths=['src/lib/video/submission.ts','src/lib/video/workflow-freeze.ts'];
  const sourceBytes=await Promise.all(sourcePaths.map(file=>readFile(path.resolve(file))));
  const hashes=sourceBytes.map(bytes=>createHash('sha256').update(bytes).digest('hex'));
  try{
    const {recordSupplierVideoDefinition}=await import('../src/lib/supplier-models/video-access');
    const map=(duration:number,resolution:string)=>[{durations:[duration],resolutions:[resolution]}];
    const common:VideoModelDefinition={modes:['single_image'],durationResolutionMap:map(5,'720p'),aspectRatios:['16:9'],limits:{images:1,videos:0,audios:0},supportsFirstFrame:true};
    const definitions:{id:string;manual:VideoModelDefinition;vendor:VideoModelDefinition}[]=[
      {id:'duration-null',manual:{...common,durationResolutionMap:null},vendor:{modeParameters:{single_image:{durationResolutionMap:map(5,'720p'),aspectRatios:['16:9']}}}},
      {id:'duration-empty',manual:{...common,durationResolutionMap:[]},vendor:{modeParameters:{single_image:{durationResolutionMap:map(5,'720p'),aspectRatios:['16:9']}}}},
      {id:'aspect-null',manual:{...common,aspectRatios:null},vendor:{modeParameters:{single_image:{durationResolutionMap:map(5,'720p'),aspectRatios:['16:9']}}}},
      {id:'aspect-empty',manual:{...common,aspectRatios:[]},vendor:{modeParameters:{single_image:{durationResolutionMap:map(5,'720p'),aspectRatios:['16:9']}}}},
      {id:'admin-conflict',manual:common,vendor:{modeParameters:{single_image:{durationResolutionMap:map(10,'1080p'),aspectRatios:['9:16']}}}},
    ];
    const providerId='source-authority';
    const key=await f.credentials.importPlain({providerId,plain:'fixture-frozen-source-not-a-real-key',actor:'fixture'});
    f.config.providers.push({id:providerId,name:'Frozen source fixture',protocol:'openai-videos',baseUrl:f.origin,credentialRef:key.id,enabled:true,timeoutMs:10000,maxConcurrent:1});
    for(const row of definitions){
      await recordSupplierVideoDefinition(f.sql,{providerId,modelId:row.id,definition:row.vendor,sourceUrl:f.origin+'/documented/'+row.id});
      f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:'up-'+row.id,providerId,model:row.id,modality:'video',capabilities:{...structuredClone(f.config.upstreamModels[0].capabilities),edit:false,maxReferenceImages:1,video:row.manual},parameterMap:{}});
      f.config.publicModels.push({id:'video-'+row.id,label:row.id,modality:'video',enabled:true,visible:true,target:{type:'upstream',id:'up-'+row.id},toolScope:{features:['video.generate'],defaultFor:row.id==='admin-conflict'?['video.generate']:[]}});
    }
    f.config.bindings['video.generate']='video-admin-conflict';
    const snapshot=await f.repo.current();
    const db=await import('../src/lib/db');pool=db.getPool();
    assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema,f.schemaName);
    await db.ensureSchema();
    const {getModelAdministration}=await import('../src/lib/model-config/server');
    const {getBillingRuntime}=await import('../src/lib/billing/server');
    const {runModelExecution}=await import('../src/lib/model-config/context');
    const {createValidatedVideo}=await import('../src/lib/video/submission');
    const {freezeVideoWorkflow}=await import('../src/lib/video/workflow-freeze');
    const admin=await getModelAdministration();assert.equal((await admin.repo.current()).digest,snapshot.digest);
    const billing=await(await getBillingRuntime()).config.current();
    const hooks={submit:async()=>{hookPosts++;},creationError:async()=>{creationErrors++;}};
    const actor='frozen-source@fixture.test';
    const base:CreateVideoInput={source:'canvas',seconds:'5',size:'720p',prompt:'A ceramic cube rotates.',mode:'single_image',durationSeconds:5,resolution:'720p',aspectRatio:'16:9',references:[{id:'poison-reference',kind:'image',role:'first_frame',url:'https://reference.fixture.invalid/input.png'}]};
    const cases=[
      {id:'duration-null',code:'UNSUPPORTED_DURATION'},
      {id:'duration-empty',code:'UNSUPPORTED_DURATION'},
      {id:'aspect-null',code:'UNSUPPORTED_ASPECT_RATIO'},
      {id:'aspect-empty',code:'UNSUPPORTED_ASPECT_RATIO'},
      {id:'admin-conflict',label:'vendor-duration',patch:{durationSeconds:10},code:'UNSUPPORTED_DURATION'},
      {id:'admin-conflict',label:'vendor-resolution',patch:{resolution:'1080p'},code:'UNSUPPORTED_RESOLUTION'},
      {id:'admin-conflict',label:'vendor-aspect',patch:{aspectRatio:'9:16'},code:'UNSUPPORTED_ASPECT_RATIO'},
    ];
    const frozenRows=await f.sql.query('SELECT upstream_id,value FROM app_video_model_defaults WHERE model_version=$1 ORDER BY upstream_id',[snapshot.version]);
    assert.equal(frozenRows.rowCount,5);
    const frozenHash=createHash('sha256').update(JSON.stringify(frozenRows.rows)).digest('hex');
    const frozenFor=(id:string)=>{
      const frozen=frozenRows.rows.find(row=>row.upstream_id==='up-'+id)!.value;
      assert.equal(frozen.sources.durationResolutionMap,'admin');assert.equal(frozen.sources.aspectRatios,'admin');assert.equal(frozen.sources.modeParameters,'vendor');assert(frozen.sourceRevision);
      return structuredClone(frozen);
    };
    const scopeFor=(id:string)=>({frozen:{feature:'video.generate',modelVersion:snapshot.version,billingVersion:billing.version,modelDigest:snapshot.digest,publicModelId:'video-'+id,binding:'video.generate',modality:'video' as const,target:{type:'upstream' as const,id:'up-'+id},credentialRef:key.id,video:frozenFor(id)},connection:{providerId,protocol:'openai-videos',baseUrl:f.origin,apiKey:'fixture-unused-key',wireModel:id,timeoutMs:10000},capabilities:f.config.upstreamModels.find(row=>row.id==='up-'+id)!.capabilities,parameterMap:{}});
    const inputFor=(id:string,patch:Partial<CreateVideoInput>={})=>({...structuredClone(base),modelId:'video-'+id,...patch});
    const planFor=(input:CreateVideoInput):VideoWorkflowPlan=>({id:randomUUID(),projectKey:'tree:frozen-source-fixture',nodes:[{id:'one',request:{modelId:input.modelId,prompt:input.prompt,mode:input.mode,durationSeconds:input.durationSeconds,resolution:input.resolution,aspectRatio:input.aspectRatio,references:structuredClone(input.references)},dependsOn:[]}]});
    const errorCode=async(action:()=>Promise<unknown>)=>{try{await action();return 'ACCEPTED';}catch(error){if(error&&typeof error==='object'&&'code' in error)return String(error.code);throw error;}};
    const noReservation=async()=>{
      assert.equal((await pool!.query('SELECT count(*)::int AS n FROM app_gen_reservations')).rows[0].n,0);
      const table=(await pool!.query("SELECT to_regclass('app_video_tasks') AS name")).rows[0].name;
      if(table)assert.equal((await pool!.query('SELECT count(*)::int AS n FROM app_video_tasks')).rows[0].n,0);
      assert.equal(supplierPosts,0);assert.equal(httpRequests,0);assert.equal(fetchCalls,0);assert.equal(hookPosts,0);assert.equal(creationErrors,0);
    };
    for(const row of cases){
      const input=inputFor(row.id,row.patch),label=row.label||row.id;
      const submitCode=await errorCode(()=>runModelExecution(scopeFor(row.id),()=>createValidatedVideo(actor,input,hooks)));
      const workflowCode=await errorCode(()=>freezeVideoWorkflow(actor,planFor(input)));
      assert.equal(submitCode,row.code,'submission '+label);assert.equal(workflowCode,row.code,'workflow '+label);
      await noReservation();
      console.log(`CASE=${label} CREATE=${submitCode} FREEZE=${workflowCode} reservations=0 supplier_POST=0 hook_POST=0`);
    }
    // Poison media proves legal admin settings survive normalization, then stop
    // at the real reference-authorization boundary, before quote/reservation.
    const legal=inputFor('admin-conflict');
    assert.equal(await errorCode(()=>runModelExecution(scopeFor('admin-conflict'),()=>createValidatedVideo(actor,legal,hooks))),'REFERENCE_UNAVAILABLE');
    const legalPlan=planFor(legal),stages=await freezeVideoWorkflow(actor,legalPlan);
    assert.deepEqual([legalPlan.nodes[0].request.durationSeconds,legalPlan.nodes[0].request.resolution,legalPlan.nodes[0].request.aspectRatio],[5,'720p','16:9']);
    assert.deepEqual(stages.one.bundle?.video?.video,frozenFor('admin-conflict'));assert.equal(stages.one.quote.version,billing.version);
    console.log('CASE=admin-legal CREATE=REFERENCE_UNAVAILABLE FREEZE=ACCEPTED normalized=5/720p/16:9 actual_quote=true reservations=0 supplier_POST=0 hook_POST=0');

    // Negative control: all real imports/dependencies, only the prior branch
    // expression restored in memory. No checkout mutation and no dependency stub.
    function oldModule(index:number):Record<string,unknown>{
      const source=sourceBytes[index].toString('utf8'),needle='frozen?{...frozen.definition,sources:frozen.sources}:resolveVideoCapability({manual:definition})';
      assert.equal(source.split(needle).length-1,1,'exact sources branch anchor');
      const output=ts.transpileModule(source.replace(needle,'resolveVideoCapability({manual:definition})'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
      const compiledModule={exports:{} as Record<string,unknown>};
      new Function('require','module','exports',output)(createRequire(path.resolve(sourcePaths[index])),compiledModule,compiledModule.exports);
      return compiledModule.exports;
    }
    const oldCreate=oldModule(0).createValidatedVideo as typeof createValidatedVideo;
    const oldFreeze=oldModule(1).freezeVideoWorkflow as typeof freezeVideoWorkflow;
    let detected=0;
    for(const row of cases.slice(0,4)){
      const input=inputFor(row.id);
      const createCode=await errorCode(()=>runModelExecution(scopeFor(row.id),()=>oldCreate(actor,input,hooks)));
      const freezeCode=await errorCode(()=>oldFreeze(actor,planFor(input)));
      assert.equal(createCode,'REFERENCE_UNAVAILABLE');assert.equal(freezeCode,'ACCEPTED');assert.notEqual(createCode,row.code);assert.notEqual(freezeCode,row.code);detected+=2;
      console.log(`OLD_CONTROL=${row.id} CREATE=${createCode} FREEZE=${freezeCode} expected=${row.code} regression_detected=true`);
    }
    const oldLegalCreate=await errorCode(()=>runModelExecution(scopeFor('admin-conflict'),()=>oldCreate(actor,legal,hooks)));
    const oldLegalFreeze=await errorCode(()=>oldFreeze(actor,planFor(legal)));
    assert.equal(oldLegalCreate,'UNSUPPORTED_DURATION');assert.equal(oldLegalFreeze,'UNSUPPORTED_DURATION');detected+=2;
    console.log(`OLD_CONTROL=admin-legal CREATE=${oldLegalCreate} FREEZE=${oldLegalFreeze} expected=admin-values-survive regression_detected=true`);
    await noReservation();
    const after=await f.sql.query('SELECT upstream_id,value FROM app_video_model_defaults WHERE model_version=$1 ORDER BY upstream_id',[snapshot.version]);
    assert.equal(createHash('sha256').update(JSON.stringify(after.rows)).digest('hex'),frozenHash,'PG frozen rows immutable');
    for(const[index,file]of sourcePaths.entries())assert.equal(createHash('sha256').update(await readFile(path.resolve(file))).digest('hex'),hashes[index],'production bytes unchanged');
    console.log(`VIDEO_FROZEN_SOURCE_AUTHORITY=PASS real_pg=true real_create_entry=true submission_scope=synthetic real_workflow_entry=true workflow_dependencies=actual cases=8 entry_checks=16 old_control_regressions=${detected} frozen_rows=5 immutable=true RESERVATIONS=0 SUPPLIER_POST=0 HOOK_POST=0 HTTP=0 production_unchanged=true`);
  }finally{
    globalThis.fetch=originalFetch;
    try{await pool?.end();}finally{await f.cleanup();}
    for(const[key,value]of Object.entries(previousEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    console.log('CLEANUP=PASS own_random_schema_dropped=true app_pool_closed=true fixture_pools_closed=true fixture_http_closed=true');
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
