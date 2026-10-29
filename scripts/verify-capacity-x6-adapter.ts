/** Actual adapter source, real loopback HTTP and isolated PG. No paid upstream. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {getEventListeners} from 'node:events';
import ts from 'typescript';
import sharp from 'sharp';
import {createModelFixture} from './model-config-fixture';

async function main(){
 const out=path.resolve(process.env.X6_OUT||'output/capacity-x6-adapter/test');fs.mkdirSync(out,{recursive:true});
 // Storage configuration is captured on import (the model fixture imports
 // settings). Establish private local storage before constructing that fixture.
 Object.assign(process.env,{NAUMI_MULTI_USER:'1',STORAGE_DRIVER:'local',MEDIA_DIR:path.join(out,'media'),MEDIA_PRIVATE:'1'});
 const sourcePath=path.resolve(process.env.APIMART_SOURCE_FILE||'src/lib/model-config/apimart-preset.ts');
 const source=fs.readFileSync(sourcePath,'utf8'),reports:any[]=[],posts:any[]=[],gets:string[]=[],tasks=new Map<string,any>();
 const png=await sharp({create:{width:256,height:256,channels:3,background:'#426080'}}).png().toBuffer();
 let origin='',uploads=0,uploadFail=false,downloads=0,queryMode='',virtual=false,now=0,abort:AbortController|undefined,queryStarted=0;
 const waits:number[]=[];let seenSignal:AbortSignal|undefined;
 const f=await createModelFixture(async(req,res)=>{
  try{
   const url=new URL(req.url!,origin);res.setHeader('content-type','application/json');
   if(url.pathname.startsWith('/media/')){
    assert.equal(req.headers.authorization,undefined);downloads++;
    if(url.pathname==='/media/bad'){res.statusCode=503;return res.end('synthetic unavailable')}
    res.setHeader('content-type','image/png');return res.end(png);
   }
   if(url.pathname==='/v1/uploads/images'){
    uploads++;for await(const _ of req){}if(uploadFail){res.statusCode=503;return res.end(JSON.stringify({error:{code:'unavailable'}}))}
    return res.end(JSON.stringify({url:'https://fixture.invalid/reference.png'}));
   }
   if(url.pathname.startsWith('/v1/tasks/')){
    const id=url.pathname.split('/').at(-1)!,t=tasks.get(id);assert.ok(t);gets.push(id);t.gets++;
    if(!queryStarted)queryStarted=performance.now();
    if(queryMode==='hang-headers'||queryMode==='hang-body'){
     if(t.gets===1){const owner=abort;setTimeout(()=>owner?.abort(new Error('fixture-watchdog')),450);}
     if(queryMode==='hang-body'){res.writeHead(200);res.write('{"data":');}return;
    }
    if(queryMode==='poll-503'&&t.gets===1){res.statusCode=503;return res.end(JSON.stringify({error:{code:'unavailable'}}))}
    if(queryMode==='poll-reset'&&t.gets===1)return req.socket.destroy();
    if(queryMode==='poll-503-repeat'){res.statusCode=503;return res.end(JSON.stringify({error:{code:'unavailable'}}))}
    if(queryMode==='poll-400'){res.statusCode=400;return res.end(JSON.stringify({error:{code:'invalid_request'}}))}
    const pending=['running','load','progress-load'].includes(queryMode);
    return res.end(JSON.stringify({data:{id:queryMode==='mismatch'?'another_task':id,...(queryMode==='progress-load'?{progress:t.gets<3?0:1}:{}),model:t.prompt==='model-differs'?'reported-model':t.model,status:t.prompt==='task-failed'?'failed':pending?'processing':'completed',cost:'0.01',result:{images:[{url:t.prompt==='partial'?[origin+'/media/ok',origin+'/media/bad']:[origin+'/media/ok']}]}}}));
   }
   assert.equal(url.pathname,'/v1/images/generations');
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const b=JSON.parse(Buffer.concat(chunks).toString());
   posts.push({payload:b,key:req.headers['idempotency-key']});
   if(b.prompt==='reject'){res.statusCode=400;return res.end(JSON.stringify({error:{billing_status:'not_charged'}}))}
   if(b.prompt==='lost')return req.socket.destroy();
   if(b.prompt==='invalid-json')return res.end('{broken');
   if(b.prompt==='missing-task')return res.end(JSON.stringify({data:{status:'submitted'}}));
   const id='x6_'+posts.length;tasks.set(id,{...b,gets:0});
   res.statusCode=b.model.startsWith('gemini')?202:200;
   return res.end(JSON.stringify(b.model.startsWith('gemini')?{data:{id,status:'pending'}}:{data:[{task_id:id,status:'submitted'}]}));
  }catch(e){res.statusCode=500;res.end(JSON.stringify({error:{code:'fixture-error'}}));console.error(e)}
 });origin=f.origin;
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,MODEL_CONFIG_TRUSTED_ORIGINS:origin,NAUMI_MULTI_USER:'1',STORAGE_DRIVER:'local',MEDIA_DIR:path.join(out,'media'),MEDIA_PRIVATE:'1'});
 const db=await import('../src/lib/db'),context=await import('../src/lib/model-config/context'),gateway=await import('../src/lib/image-gateway');
 const transportModule=await import('../src/lib/model-config/transport');
 const c:any={console,Request,Response,Headers,FormData,File,Buffer,URL,AbortSignal,JSON,createHash,sharp,
  Date:class extends Date{static now(){return virtual?now:Date.now()}},
  Math:Object.assign(Object.create(Math),{random:()=>0.5}),
  setTimeout:(fn:()=>void,ms:number)=>{if(virtual){waits.push(ms);return setTimeout(()=>{now+=ms;fn()},0)}return setTimeout(fn,ms)},clearTimeout,
  ...await import('../src/lib/model-config/apimart-image-parameters'),...await import('../src/lib/model-config/seedream-preflight'),...await import('../src/lib/model-config/channel-availability'),...transportModule,...await import('../src/lib/model-config/image-preset'),...await import('../src/lib/model-config/types'),...gateway,
  ...await import('../src/lib/supplier-cost/collect'),...await import('../src/lib/supplier-cost/runtime'),...await import('../src/lib/supplier-cost/adapters'),...await import('../src/lib/supplier-cost/money'),...await import('../src/lib/supplier-cost/io'),...await import('../src/lib/billing/synchronous'),...await import('../src/lib/model-config/channel-image-response'),...await import('../src/lib/supplier-cost/adapter-failure')};
 const ast=ts.createSourceFile(sourcePath,source,ts.ScriptTarget.Latest,true),found:string[]=[];
 ast.forEachChild(n=>{if(ts.isFunctionDeclaration(n)&&['apimartExecutionParameters','apimartImagesFetch'].includes(n.name?.text||''))found.push(n.getText(ast).replace(/^export\s+/,''))});assert.equal(found.length,2);
 vm.createContext(c);vm.runInContext(ts.transpileModule(found.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);
 const scope=(wire='gemini-3-pro-image-preview',timeout=1000)=>({capacityReserved:true,frozen:{modality:'image',binding:'image.generate',feature:'canvas.image',modelVersion:1,billingVersion:1,modelDigest:'a'.repeat(64),publicModelId:wire,target:{type:'upstream',id:'u1'},imageParameterPlanVersion:1,requestedParameters:{quality:'high',resolution:'4K',ratio:'3:4'},facts:{quality:'high',resolution:'4K',ratio:'3:4'}},connection:{providerId:'p1',protocol:'apimart-images',wireModel:wire,baseUrl:origin+'/v1',apiKey:f.marker,timeoutMs:timeout},capabilities:{generate:true,edit:true,qualities:['high'],nativeResolutions:['1K','2K','4K'],maxReferenceImages:10},parameterMap:{qualityPolicy:{mode:'map',choices:[{id:'high',label:'高',value:'high'}]},resolutionPolicy:{mode:'map',field:'resolution',ratioField:'size',values:{'1K':'1k','2K':'2k','4K':'4k'}},apimartImages:{schemaVersion:1,maxOutputs:4,supportsMask:false,ratios:['3:4']}}} as any);
 const run=(s:any,id:string,prompt='synthetic',images=0,n=1,pollMs:number|null=1,media?:typeof fetch)=>context.runModelExecution(s,()=>gateway.withImageOperation(s.frozen.publicModelId,{id},async()=>{
  const native=transportModule.modelEndpointFetch(s.connection.baseUrl,{trustedOrigins:[origin]},{...s.connection,costDisabled:true,costScope:s});
  const transport:typeof fetch=(input,init)=>{seenSignal=init?.signal as AbortSignal;return native(input,init)};
  let body:any=JSON.stringify({prompt,n}),headers:any={'content-type':'application/json'};
  if(images){body=new FormData();body.set('prompt',prompt);body.set('n',String(n));for(let i=0;i<images;i++)body.append('image[]',new File([new Uint8Array(png)],`ref-${i}.png`,{type:'image/png'}));headers={}}
  return c.apimartImagesFetch(s,{trustedOrigins:[origin]},{transport,media,...(pollMs===null?{}:{pollMs})})(origin+'/v1/images/'+(images?'edits':'generations'),{method:'POST',headers,body,signal:abort?.signal}) as Promise<Response>;
 }));
 const row=async(id:string)=>(await f.sql.query('SELECT * FROM app_supplier_calls WHERE billing_unit_id=$1',[id])).rows[0];
 const check=async(name:string,fn:()=>Promise<void>)=>{queryMode='';virtual=false;queryStarted=0;abort=undefined;try{await fn();reports.push({name,pass:true});console.log('PASS '+name)}catch(e){reports.push({name,pass:false,error:String(e)});console.log('FAIL '+name+': '+String(e))}finally{queryMode='';virtual=false;abort=undefined}};
 try{
  await db.ensureSchema();
  for(const wire of ['gemini-3-pro-image-preview','gemini-3.1-flash-image-preview','seedream-5-0-pro','seedream-5-0-flash','gpt-image-2.5-sunburst'])await check(wire+'_generate_edit_recover',async()=>{
   const s=scope(wire),before=posts.length,frozen=JSON.stringify(s.frozen);
   for(const images of [0,3]){const id=wire+'-'+images;assert.equal((await run(s,id,'synthetic',images)).status,200);const saved=await row(id);assert.equal(saved.parameters.acceptedOutputs,1);assert.equal(saved.amount_micros,'10000');const firstKey=posts.at(-1).key;assert.equal((await run(s,id,'synthetic',images)).status,200);assert.equal(posts.at(-1).key,firstKey);assert.equal(posts.at(-1).payload.output_format,undefined)}
   assert.equal(posts.length,before+2);assert.equal(JSON.stringify(s.frozen),frozen);
  });
  await check('explicit_rejection_and_upload_failure_no_paid_retry',async()=>{
   const s=scope(),start=posts.length;assert.equal((await run(s,'reject','reject')).status,422);assert.equal((await row('reject')).amount_micros,'0');
   uploadFail=true;try{assert.equal((await run(s,'upload-fail','synthetic',2)).status,422)}finally{uploadFail=false}
   assert.equal(posts.length,start+1);assert.equal((await row('upload-fail')).parameters,null);assert.equal((await row('upload-fail')).evidence.adapterStage,'upload');
   assert.equal((await run(s,'upload-fail','synthetic',2)).status,200);assert.equal(posts.length,start+2);
  });
  await check('preflight_preserves_original_error_and_zero_paid_posts',async()=>{
   const s=scope('seedream-5-0-pro'),start=posts.length,up=uploads;
   await assert.rejects(()=>run(s,'seedream-invalid-count','synthetic',0,2),(e:any)=>e.code==='INVALID_REQUEST');
   assert.equal(posts.length,start);assert.equal(uploads,up);
   const rows=await f.sql.query("SELECT * FROM app_supplier_calls WHERE model='seedream-5-0-pro' AND parameters IS NULL");assert.equal(rows.rowCount,1);
  });
  await check('preledger_parameter_rejection_can_have_zero_supplier_rows',async()=>{
   const s=scope();s.frozen.requestedParameters.ratio='17:19';s.frozen.facts.ratio='17:19';
   const count=await f.sql.query('SELECT count(*) FROM app_supplier_calls');await assert.rejects(()=>run(s,'invalid-ratio'),(e:any)=>e.code==='IMAGE_MAPPING_INVALID');assert.deepEqual((await f.sql.query('SELECT count(*) FROM app_supplier_calls')).rows,count.rows);
  });
  for(const mode of ['lost','invalid-json','missing-task'])await check(mode+'_unknown_never_reposts',async()=>{
   const s=scope(),before=posts.length;await assert.rejects(()=>run(s,mode,mode),gateway.ImageOperationPending);const saved=await row(mode);assert.equal(saved.state,'unknown');assert.equal(saved.amount_micros,null);assert.ok(saved.parameters.requestHash);await assert.rejects(()=>run(s,mode,mode),gateway.ImageOperationPending);assert.equal(posts.length,before+1);
  });
  await check('partial_and_actual_model_receipts_remain_deliverable',async()=>{
   for(const mode of ['partial','model-differs']){const res=await run(scope(),mode,mode,0,mode==='partial'?2:1);assert.equal(res.status,200);assert.equal((await res.json()).data.length,1);const saved=await row(mode);assert.equal(saved.parameters.acceptedOutputs,1);assert.ok(saved.parameters.deliveryNotices.includes(mode==='partial'?'output-download-incomplete':'actual-model-differs'))}
   assert.equal((await run(scope(),'task-failed','task-failed')).status,422);assert.equal((await row('task-failed')).parameters.acceptedOutputs,undefined);
  });
  await check('rejected_media_body_cancelled_before_same_url_retry',async()=>{
   let calls=0,cancelled=0;const urls:string[]=[];
   const media:typeof fetch=async(input)=>{urls.push(String(input));if(++calls===1)return new Response(new ReadableStream({cancel(){cancelled++}}),{status:503});return new Response(new Uint8Array(png))};
   const before=posts.length;assert.equal((await run(scope(),'download-cancel','synthetic',0,1,1,media)).status,200);
   assert.equal(calls,2);assert.equal(cancelled,1);assert.equal(urls[0],urls[1]);assert.equal(posts.length,before+1);
  });
  await check('native_checkpoint_delivery_quote_and_once_only_settlement',async()=>{
   const {DurableImageJobs}=await import('../src/lib/durable-image-jobs'),repo=await import('../src/lib/image-job-repository');
   const {recoverStoredDelivery}=await import('../src/lib/imagegen/stored-delivery'),{USER_COOKIE,signUserSession}=await import('../src/lib/native-auth');
   const {GET:jobGet}=await import('../src/app/api/generate-image/route'),{GET:mediaGet}=await import('../src/app/media/[...path]/route');
   const owner='capacity-x6@fixture.test',other='capacity-x6-other@fixture.test';await db.getOrCreateUser(owner);await db.getOrCreateUser(other);await db.addCreditBatch(owner,100,{source:'admin',reason:'X6 isolated fixture'});await db.setSetting('multi_user_enabled','1');
   const quote:any={schemaVersion:1,engineVersion:1,configVersion:1,facts:{feature:'image.generate',quantity:1,quality:'high',resolution:'4K',metered:true,byok:false,paidFen:0,userGroup:'fixture'},tariff:{label:'X6 fixture',rules:[],enabled:true,unit:'image',pricing:{mode:'fixed',credits:6},settlement:{unknown:'hold',qualityBasis:'requested',successBasis:'successful-units',failureBps:0,byokBps:10000,reserveBps:10000}},costRates:{},reserveCredits:6,requestedCredits:6,authorizedCredits:6,matchedRuleId:null};
   for(const wire of ['gemini-3-pro-image-preview','seedream-5-0-pro']){
    const s=scope(wire),id='x6-native-'+wire,parent='imagegen-'+id,nonce='x6-fixed-nonce-'+wire,jobs=new DurableImageJobs<any>('generate');
    const plan={request:{version:1,operationId:nonce,entry:'canvas',mode:'generate',prompt:'X6 synthetic',inputs:[],variants:1,output:{format:'png'}},intent:{operation:'generate',background:'opaque',conflicts:[],requirements:[]},steps:[{key:'generate',operation:'generate',parameters:{},eligibleUpstreamIds:[],credits:6}],warnings:[],totalCredits:6,confirmationRequired:false};
    await jobs.create(id,owner,{status:'pending',createdAt:Date.now()},{p:{count:1,prompt:'X6 synthetic',quality:'high'},cost:6,nonce},6,true,quote);
    await repo.createImageJob(parent,owner,'imagegen',{status:'error',children:{generate:{jobId:id}},result:{operationId:nonce,jobId:parent,status:'failed',stage:'saving',artifacts:[],chargedCredits:0,warnings:[]}},{plan},0,false);
    const before=posts.length;let callback=false;
    await jobs.kick(id,()=>context.runModelExecution(s,async()=>{
     callback=true;await jobs.paidOperation(id,wire,{id,managedGateway:false},async()=>{const response=await run(s,id,'synthetic',3);assert.equal(response.status,200);const b=await response.json();return b.data.map((image:any)=>({url:'data:image/png;base64,'+image.b64_json}))});
     await jobs.patch(id,{status:'error',error:'synthetic interruption after paid checkpoint'});
    }));
    let saved:any;const limit=Date.now()+15000;do{saved=await repo.getImageJob(id,'generate');if(callback&&saved&&!saved.lease_token&&saved.snapshot.status==='error')break;await new Promise(r=>setTimeout(r,20))}while(Date.now()<limit);
    assert.equal(callback,true);assert.equal(saved.snapshot.paidOperations[id].state,'done');assert.equal(saved.lease_token,null);assert.equal(posts.length,before+1);
    const token=saved.snapshot.paidOperations[id].attemptToken,hash=createHash('sha256').update(JSON.stringify(saved.payload.billingQuote)).digest('hex');
    assert.equal(await db.getImageJobChargedCredits(id),0);
    const recovered=await recoverStoredDelivery(parent,owner);assert.equal(recovered.complete,true);assert.equal(recovered.artworkIds.length,1);
    assert.deepEqual((await recoverStoredDelivery(parent,owner)).artworkIds,recovered.artworkIds);assert.equal(posts.length,before+1);
    const final=(await repo.getImageJob(id,'generate'))!;assert.equal((final.snapshot.paidOperations as any)[id].attemptToken,token);assert.equal(final.payload.nonce,nonce);assert.equal(createHash('sha256').update(JSON.stringify(final.payload.billingQuote)).digest('hex'),hash);
    assert.deepEqual((await db.getPool().query('SELECT count(*)::int n,sum(delta)::int delta FROM app_ledger WHERE id=$1',['led-image-'+id])).rows[0],{n:1,delta:-6});
    const request=(url:string,email=owner)=>new Request(new URL(url,origin),{headers:{cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`}});
    const poll=await jobGet(request('/api/generate-image?job='+id));assert.equal(poll.status,200);const delivered=await poll.json();assert.equal(delivered.images.length,1);
    const image=delivered.images[0],media=await mediaGet(request(image.url),{params:Promise.resolve({path:image.url.slice(7).split('/')})});assert.equal(media.status,200);assert.equal(createHash('sha256').update(Buffer.from(await media.arrayBuffer())).digest('hex'),createHash('sha256').update(png).digest('hex'));
    assert.equal((await jobGet(request('/api/generate-image?job='+id,other))).status,403);assert.equal((await mediaGet(request(image.url,other),{params:Promise.resolve({path:image.url.slice(7).split('/')})})).status,404);
   }
  });
  await check('poll_503_recovers_same_task_inside_budget',async()=>{
   queryMode='poll-503';const before=posts.length,res=await run(scope(),'poll-503');assert.equal(res.status,200);const saved=await row('poll-503');assert.equal(tasks.get(saved.task_id).gets,2);assert.equal(posts.length,before+1);
  });
  await check('poll_400_retains_task_without_retry',async()=>{
   queryMode='poll-400';await assert.rejects(()=>run(scope(),'poll-400'),gateway.ImageOperationPending);const saved=await row('poll-400');assert.equal(tasks.get(saved.task_id).gets,1);assert.equal(saved.evidence.httpStatus,400);assert.ok(saved.task_id);
  });
  for(const mode of ['hang-headers','hang-body'])await check(mode+'_bounded_original_deadline',async()=>{
   queryMode=mode;abort=new AbortController();await assert.rejects(()=>run(scope('seedream-5-0-pro',100),mode),gateway.ImageOperationPending);const elapsed=performance.now()-queryStarted;
   console.log(`MEASURE ${mode} elapsedFromGET=${Math.round(elapsed)}ms budget=100ms`);
   assert.ok(elapsed<350,'query exceeded its original budget until external watchdog');const saved=await row(mode);assert.ok(saved.task_id);assert.equal(saved.amount_micros,null);
   queryMode='';abort=undefined;const before=posts.length;assert.equal((await run(scope('seedream-5-0-pro',100),mode)).status,200);assert.equal(posts.length,before);
  });
  await check('default_wait_clipped_to_remaining_budget',async()=>{
   queryMode='running';const started=performance.now();await assert.rejects(()=>run(scope('gemini-3-pro-image-preview',80),'wait-budget','synthetic',0,1,null),gateway.ImageOperationPending);
   const elapsed=performance.now()-started;console.log(`MEASURE wait elapsed=${Math.round(elapsed)}ms budget=80ms`);assert.ok(elapsed<450);
  });
  await check('default_backoff_load_and_deadline',async()=>{
   queryMode='load';virtual=true;now=0;waits.length=0;const before=gets.length;await assert.rejects(()=>run(scope('gemini-3-pro-image-preview',60000),'load','synthetic',0,1,null),gateway.ImageOperationPending);
   const count=gets.length-before;console.log(`MEASURE simulated60s queries=${count} waits=${JSON.stringify(waits)} finalClock=${now}`);assert.ok(count<=12,'fixed 2s polling still generates 30 queries/minute');assert.equal(now,60000);assert.ok(waits.every(v=>v>0&&v<=8000));
  });
  await check('abort_during_wait_no_extra_query_or_listener',async()=>{
   queryMode='running';abort=new AbortController();const old=c.setTimeout;c.setTimeout=(fn:()=>void,ms:number)=>{setTimeout(()=>abort?.abort(new Error('fixture-cancel')),1);return old(fn,ms)};
   try{await assert.rejects(()=>run(scope(),'abort-wait','synthetic',0,1,500),gateway.ImageOperationPending);assert.ok(seenSignal);assert.equal(getEventListeners(seenSignal!,'abort').length,0);assert.equal(tasks.get((await row('abort-wait')).task_id).gets,1)}finally{c.setTimeout=old}
  });

  await check('parent_progress_growth_resets_backoff_without_new_POST',async()=>{
   queryMode='progress-load';virtual=true;now=0;waits.length=0;const before=posts.length;
   await assert.rejects(()=>run(scope('gemini-3-pro-image-preview',15000),'parent-progress','synthetic',0,1,null),gateway.ImageOperationPending);
   console.log('PARENT_PROGRESS waits='+JSON.stringify(waits));assert.ok(waits[2]<waits[1]);assert.equal(now,15000);assert.equal(posts.length,before+1);
  });
  await check('parent_repeated_503_stays_inside_original_budget_and_task',async()=>{
   queryMode='poll-503-repeat';virtual=true;now=0;waits.length=0;const before=posts.length;
   await assert.rejects(()=>run(scope('seedream-5-0-pro',6000),'parent-503','synthetic',0,1,null),gateway.ImageOperationPending);
   const saved=await row('parent-503');assert.equal(now,6000);assert.ok(tasks.get(saved.task_id).gets>=2);assert.equal(posts.length,before+1);assert.equal(saved.amount_micros,null);assert.ok(saved.parameters.requestHash);
  });
  await check('parent_real_GET_socket_reset_retries_same_task_only',async()=>{
   queryMode='poll-reset';const before=posts.length;
   assert.equal((await run(scope(),'parent-reset')).status,200);const saved=await row('parent-reset');assert.equal(posts.length,before+1);assert.equal(tasks.get(saved.task_id).gets,2);
  });
  await check('parent_mismatched_receipt_never_authorizes_repost_or_retry',async()=>{
   queryMode='mismatch';const before=posts.length;
   await assert.rejects(()=>run(scope(),'parent-mismatch'),gateway.ImageOperationPending);let saved=await row('parent-mismatch');assert.equal(tasks.get(saved.task_id).gets,1);assert.ok(saved.parameters.requestHash);assert.equal(saved.parameters.acceptedOutputs,undefined);
   await assert.rejects(()=>run(scope(),'parent-mismatch'),gateway.ImageOperationPending);saved=await row('parent-mismatch');assert.equal(posts.length,before+1);assert.equal(tasks.get(saved.task_id).gets,2);
  });
 }finally{await db.getPool().end();await f.cleanup()}
 const failed=reports.filter(r=>!r.pass).length,result={sourcePath,sourceSha256:createHash('sha256').update(source).digest('hex'),reports,failed,posts:posts.length,queries:gets.length,uploads,downloads,realSupplierCalls:0};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2));console.log(`X6_ADAPTER=${failed?'FAIL':'PASS'} CASES=${reports.length} FAILED=${failed} REAL_SUPPLIER_CALLS=0`);if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
