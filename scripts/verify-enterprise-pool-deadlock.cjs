const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{transformSync}=require('esbuild');
const root=path.resolve(process.argv[2]||'.'),baseline=process.argv.includes('--baseline');
Object.assign(process.env,{PGPOOL_MAX:'5',NAUMI_TICK_POOL_MAX:'2',NAUMI_VIDEO_COORDINATION_POOL_MAX:'2',NAUMI_DB_POOL_BUDGET:'15'});
const migratedPorts={'@/platform/db/pool':['@/lib/db','../db'],'@/lib/media-assets-schema':['../media-assets','@/lib/media-assets'],'@/lib/teams/errors':['@/lib/teams/server'],'@/lib/bi/schema':['@/lib/bi/repository'],'@/lib/object-storage/runtime':['@/lib/storage'],'@/lib/object-storage/managed-read':['@/lib/storage'],'../object-storage/runtime':['../storage'],'../object-storage/managed-read':['../storage'],'@/lib/saas/creation-access':['../saas/creation-context'],'../enterprise/media-stream':['@/lib/enterprise/media-stream'],'@/lib/feature-access/repository':['@/lib/feature-access/server']};
function load(relative,bindings={}){for(const [name,old] of Object.entries(migratedPorts)){if(!(name in bindings)){const found=old.find(p=>p in bindings);if(found)bindings[name]=bindings[found];}}
const filename=path.join(root,relative),fixtureModule={exports:{}};const code=transformSync(fs.readFileSync(filename,'utf8'),{loader:'ts',format:'cjs',target:'es2022'}).code;vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename})(name=>name==='server-only'?{}:name in bindings?bindings[name]:require(name),fixtureModule,fixtureModule.exports);return fixtureModule.exports;}
async function main(){
 let borrowed=0,bodyReads=0,queries=0;const owner='owner@example.test',asset='asset-11111111-1111-1111-1111-111111111111';
 const tx={query:async(sql,args)=>{queries++;if(sql.includes('app_media_assets')){assert.equal(args[0],owner);return {rows:[{key:`imagegen-inputs/${asset.slice(6)}.png`,content_type:'image/png'}]};}if(sql.includes('SELECT * FROM app_image_jobs'))return {rows:[{id:'job-test',email:owner,created_at:'2026-10-30',status:'done',payload:{plan:{request:{prompt:'fixture',inputs:[{artworkId:asset}]}}}}]};if(sql.includes('count(*)'))return {rows:[{n:0}]};if(sql.includes('sum(delta)'))return {rows:[{charged:0}]};return {rows:[]};}};
 const db={getPool:()=>{borrowed++;return tx;}};
 const storage={isManagedImageUrl:url=>typeof url==='string'&&url.startsWith('/media/'),readManagedObject:async()=>{bodyReads++;return {bytes:Buffer.from('fixture')};}};
 const refFile='src/lib/imagegen/input-asset-reference.ts';
 const reference=fs.existsSync(path.join(root,refFile))?load(refFile,{'../db':db,'../media-assets':{ensureMediaSchema:async()=>{}}}):{};
 // Resolve dynamic imports with a real bundled fixture module, not product rewrites.
 const esbuild=require('esbuild');
 const bindings={'./creation-contracts':load('src/lib/saas/creation-contracts.ts'),'@/lib/db':db,'@/lib/bi/repository':{ensureBiSchema:async()=>{},queryBi:async()=>({rows:[],total:0,page:1,size:24})},'@/lib/bi/contracts':{parseBiQuery:x=>x},'@/lib/storage':storage,'@/lib/teams/server':{TeamError:class extends Error{constructor(message,status=403){super(message);this.status=status;}}},'./creation-failures':{hasCreationFailure:()=>false,legacyCreationFailures:async()=>new Map()},'@/lib/imagegen/input-asset-reference':reference};
 const input=load('src/lib/imagegen/input-assets.ts',{'../db':db,'../media-assets':{ensureMediaSchema:async()=>{},registerMediaAsset:async()=>{}},'../storage':storage,'./pixels':{},'../saas/creation-context':{},'./input-asset-reference':reference});bindings['@/lib/imagegen/input-assets']=input;
 globalThis.__deadlockFixture=bindings;
 const result=await esbuild.build({entryPoints:[path.join(root,'src/lib/saas/legacy-creations.ts')],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',tsconfig:path.resolve('tsconfig.json'),plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>a.path==='server-only'||a.path in bindings?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='server-only'?'':`module.exports=globalThis.__deadlockFixture[${JSON.stringify(a.path)}]`}));}}]});
 const fixtureModule={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,fixtureModule,fixtureModule.exports);const api=fixtureModule.exports;
 const id=api.legacyCreationId({table:'app_image_jobs',id:'job-test',email:owner}),scope={client:tx,allowedEmails:[owner]};
 const detail=await api.legacyCreationDetail(id,{},scope);assert.equal(detail.detail.assets.length,1);assert.equal(detail.media[0].storageRef,`artwork:${asset}`);
 const media=await api.legacyCreationAsset(id,'legacy-media-0',scope);assert.equal(media.url,`/media/imagegen-inputs/${asset.slice(6)}.png`);
 assert.equal(borrowed,baseline?1:0);assert.equal(bodyReads,baseline?1:0);
 console.log(`ENTERPRISE_ASSET borrowed=${borrowed} bodyReads=${bodyReads} url=${media.url}`);
 const beforeDenied=queries;await assert.rejects(()=>api.legacyCreationAsset(id,'legacy-media-0',{client:tx,allowedEmails:[]}),e=>e.status===404);assert.equal(queries,beforeDenied);
 console.log('AUTH allowedEmails denied=404');
 if(!baseline){await Promise.all(Array.from({length:4},()=>api.legacyCreationAsset(id,'legacy-media-0',scope)));assert.equal(borrowed,0);assert.equal(bodyReads,0);console.log('ENTERPRISE_CONCURRENT assets=4 nested_checkout=0 bodyReads=0');}
 const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8');
 const raw=(source.match(/await fetch\(\s*`\/api\/generate-image\?job=/g)||[]).length;
 if(baseline){const controller=path.join(root,'src/lib/canvas/image-task-controller.ts');const original=fs.existsSync(controller)?(fs.readFileSync(controller,'utf8').match(/await fetch\(`\/api\/generate-image\?job=/g)||[]).length:raw;assert.equal(original,fs.existsSync(controller)?2:3);console.log('CANVAS_RECEIPT unbounded_raw_fetches='+original+' OWNER='+ (fs.existsSync(controller)?'image-task-controller':'page'));}
 else {assert.equal(raw,0);await receiptTests();await enterpriseChainTests(api,reference,bindings,tx,id);
  const full=await input.readImagegenInputAsset(asset,owner);assert.ok(Buffer.isBuffer(full.buffer));assert.equal(full.mimeType,'image/png');assert.equal(full.url,media.url);console.log('IMAGEGEN_INPUT buffer/mimeType/url=PASS');}
 const connection=load(fs.existsSync(path.join(root,'src/platform/db/pool.ts'))?'src/platform/db/pool.ts':'src/lib/db/connection.ts');const pool=connection.getPool(),tick=connection.getWorkerTickPool();
 assert.equal(pool.options.connectionTimeoutMillis,baseline?undefined:12000);assert.equal(tick.options.connectionTimeoutMillis,3000);assert.equal(pool.options.max,5);
 console.log(`POOL business_timeout=${pool.options.connectionTimeoutMillis??'unset'} tick_timeout=${tick.options.connectionTimeoutMillis} business_max=${pool.options.max}`);
 if(!baseline)await poolTimeoutTests(pool);
 await connection.closeDatabasePools();console.log(baseline?'BASELINE_EXPECTED_DEFECTS=PASS':'ENTERPRISE_POOL_DEADLOCK_FIX=PASS');
}

async function receiptTests(){
 if(fs.existsSync(path.join(root,'src/lib/canvas/image-task-controller.ts')))return controllerReceiptTests();
 const {readCanvasGenerationReceipt}=load('src/lib/canvas/generation-receipt.ts');
 const realFetch=global.fetch,realSetTimeout=global.setTimeout;
 const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ts=require('typescript');
 const sf=ts.createSourceFile('canvas.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const loops=new Map();function visit(node,fn){if(ts.isFunctionDeclaration(node))fn=node.name?.text||fn;if(ts.isForStatement(node)&&node.getText(sf).includes('readCanvasGenerationReceipt(')&&['runGen','generatePend'].includes(fn))loops.set(fn,node.getText(sf));ts.forEachChild(node,n=>visit(n,fn));}visit(sf);
 assert.equal(loops.size,2);
 try {
  global.setTimeout=(fn,ms,...args)=>realSetTimeout(fn,ms===30_000?5:ms===2500?0:ms,...args);
  for(const [name,loop] of loops){
   let attempts=0,aborted=0;
   global.fetch=async(url,init)=>{
    attempts++;assert.equal(url,'/api/generate-image?job=same-job');assert.equal(init.cache,'no-store');assert.equal(new Headers(init.headers).get('x-naumi-workspace'),'enterprise-fixture');assert.equal(new Headers(init.headers).get('x-naumi-project-context'),'project-fixture');assert.equal(init.method,undefined);
    const abort=()=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>{aborted++;reject(new DOMException('aborted','AbortError'));},{once:true}));
    if(attempts===1)return abort();
    if(attempts===2)return {text:abort};
    if(attempts===3)throw new TypeError('fixture network failure');
    return new Response(JSON.stringify({status:attempts===4?'pending':'done',images:[{id:'result',url:'/media/result.png'}]}));
   };
   const ctx={readCanvasGenerationReceipt,deadline:Date.now()+60_000,jobId:'same-job',authHeader:async()=>({}),requestWorkspace:'enterprise-fixture',requestProject:'project-fixture',current:()=>true,t:x=>x,applyServerUser:()=>{},setGenerationTasks:()=>{},setPendNodes:()=>{},taskSet:new Set(),pend:{id:'pend'},placement:null,imageOutputWarningText:()=>'',flashTip:()=>{}};
   const code=transformSync(`async function exercise(ctx){let {${Object.keys(ctx).join(',')}}=ctx;let newIds=[],generated=[],generatedSizes=[],receiptComplete=false,attachment,terminal=false,resultIds=[];${loop};return {newIds,receiptComplete};}module.exports=exercise;`,{loader:'ts',format:'cjs'}).code;
   const fixtureModule={exports:{}};new Function('module',code)(fixtureModule);
   assert.deepEqual(await fixtureModule.exports(ctx),{newIds:['result'],receiptComplete:true});assert.equal(attempts,5);assert.equal(aborted,2);
   console.log(`CANVAS_LOOP ${name} attempts=5 aborts=2 network_errors=1 pending_then_done=PASS`);
   // Existing terminal errors and six-minute deadline remain exits, not retries.
   global.fetch=async()=>new Response(JSON.stringify({status:'error',error:'fixture terminal'}));
   await assert.rejects(()=>fixtureModule.exports(ctx),/fixture terminal/);
   await assert.rejects(()=>fixtureModule.exports({...ctx,deadline:0}),/canvas.genFail/);
   global.fetch=async()=>new Response(JSON.stringify({error:'fixture forbidden'}),{status:403});
   await assert.rejects(()=>fixtureModule.exports(ctx),/fixture forbidden/);
   global.fetch=async()=>new Response(JSON.stringify({status:'done'}));
   const result=await fixtureModule.exports({...ctx,current:()=>false});assert.deepEqual(result,name==='runGen'?[]:false);
  }
  global.fetch=async()=>new Response('<html>gateway</html>',{status:503});
  await assert.rejects(()=>readCanvasGenerationReceipt('same-job',{}),/503/);
  console.log('CANVAS_EXITS terminal/http/deadline/context/invalid_json=PASS');
 }finally{global.fetch=realFetch;global.setTimeout=realSetTimeout;}
}
async function controllerReceiptTests(){
 const esbuild=require('esbuild');
 const build=await esbuild.build({entryPoints:[path.join(root,'src/lib/canvas/image-task-controller.ts')],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'browser-ports',setup(b){
  b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'workspace',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?`export const authHeader=async()=>({'x-naumi-workspace':'wrong','x-naumi-project-context':'wrong'});`:`export const currentWorkspace=()=> 'enterprise-fixture',currentWorkspaceRevision=()=>0;`,loader:'js'}));
 }}]});
 const m={exports:{}};new Function('require','module','exports',build.outputFiles[0].text)(require,m,m.exports);
 const {createCanvasImageTask}=m.exports,original={fetch:global.fetch,setTimeout:global.setTimeout,now:Date.now};let clock=1;
 try{
  Date.now=()=>clock;
  global.setTimeout=(run,ms,...args)=>{if(ms===2500){clock+=2500;return original.setTimeout(run,0,...args)}return original.setTimeout(run,ms===30000?5:ms,...args);};
  const setup=(replacement=false)=>{
   let current=true,submits=0,histories=0,positions=0,user=0;
   const scope={owner:'owner@example.test',workspace:'enterprise-fixture',project:'project-fixture',isCurrent:()=>current,assertCurrent(){if(!current)throw Error('retired');}};
   const attachment={nodeId:'node',applied:true,previousVersionId:'old',previousImage:'/media/old.png',versionId:'version',revision:1};
   const task=createCanvasImageTask({scope,prepare:async()=>new FormData(),submit:async()=>{submits++;return Response.json({jobId:'same-job'})},position:()=>({x:1,y:2}),merge:async ids=>ids.map(id=>({id,image:'/media/result.png',canvasImageRevision:1,canvasImageVersionId:'version'})),history:()=>histories++,replacement:replacement?{nodeId:'node',history:()=>histories++}:undefined,stage(){},user(){user++},notice(){},errorText:'fixture failed',saveErrorText:'save failed',resultGap:40});
   return {task,attachment,retire(){current=false},position(){positions++},snapshot:()=>({submits,histories,positions,user})};
  };
  const terminal=(extra={})=>Response.json({status:'done',images:[{id:'result',url:'/media/result.png'}],...extra});
  const checkRequest=(url,init)=>{assert.equal(url,'/api/generate-image?job=same-job');assert.equal(init.method,undefined);assert.equal(init.cache,'no-store');assert.equal(new Headers(init.headers).get('x-naumi-workspace'),'enterprise-fixture');assert.equal(new Headers(init.headers).get('x-naumi-project-context'),'project-fixture');};
  const f=setup();let attempts=0,aborts=0;
  global.fetch=async(url,init)=>{
   if(url==='/api/artworks/position'){f.position();return Response.json({ok:true})}
   checkRequest(url,init);attempts++;const stalled=()=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>{aborts++;reject(new DOMException('aborted','AbortError'))},{once:true}));
   if(attempts===1)return stalled();if(attempts===2)return {text:stalled};if(attempts===3)throw TypeError('fixture network failure');if(attempts===4)return Response.json({status:'pending'});return terminal();
  };
  assert.equal((await f.task.run()).status,'succeeded');assert.equal(attempts,5);assert.equal(aborts,2);assert.deepEqual(f.snapshot(),{submits:1,histories:1,positions:1,user:0});
  console.log('CANVAS_CONTROLLER attempts=5 aborts=2 network_errors=1 pending_then_done=PASS PAID_POST=1 ATTACH=1');
  for(const [name,response]of [['terminal',()=>Response.json({status:'error',error:'fixture terminal'})],['http',()=>Response.json({error:'fixture forbidden'},{status:403})],['invalid-json',()=>new Response('<html>gateway</html>',{status:503})]]){
   const t=setup();global.fetch=async()=>response();const result=await t.task.run();assert.equal(result.status,'failed');assert.equal(result.failure.jobId,'same-job');assert.equal(t.snapshot().histories,0);assert.equal(t.snapshot().submits,1);console.log('CANVAS_CONTROLLER_EXIT '+name+'=PASS ORIGINAL_JOB=1');
  }
  {const t=setup();let count=0;global.fetch=async()=>{count++;throw TypeError('offline')};const result=await t.task.run();assert.equal(result.status,'failed');assert(count>1&&count<145);assert.equal(t.snapshot().submits,1);console.log('CANVAS_CONTROLLER_EXIT deadline=PASS GETS='+count+' PAID_POST=1');}
  {const t=setup();global.fetch=async()=>{t.retire();return terminal()};assert.equal((await t.task.run()).status,'stale');assert.equal(t.snapshot().histories,0);console.log('CANVAS_CONTROLLER_EXIT context=PASS NO_ATTACH=1');}
  {const t=setup(true);let count=0;global.fetch=async(url,init)=>{checkRequest(url,init);count++;if(count===1)return terminal();if(count===2)throw TypeError('receipt unavailable');return terminal({canvasAttachment:t.attachment})};assert.equal((await t.task.run()).status,'failed');assert.equal((await t.task.run()).status,'failed');assert.equal((await t.task.run()).status,'succeeded');assert.equal(t.snapshot().submits,1);assert.equal(t.snapshot().histories,1);assert.equal(count,3);console.log('CANVAS_REPLACEMENT original_receipt_only=PASS SYNC_UNKNOWN_RETAINED=1 PAID_POST=1');}
 }finally{global.fetch=original.fetch;global.setTimeout=original.setTimeout;Date.now=original.now;}
}
async function poolTimeoutTests(pool){
 // Use the real pg queue/timer/removal implementation, with an in-memory wire
 // client only. No database URL or network connection is used by this fixture.
 const {EventEmitter}=require('node:events');
 class Client extends EventEmitter {constructor(){super();this._queryable=true;}connect(cb){process.nextTick(()=>cb());}end(cb){process.nextTick(()=>{this.emit('end');cb?.();});}query(sql,args,cb){if(typeof args==='function')cb=args;process.nextTick(()=>cb(null,{rows:[]}));}ref(){}unref(){}}
 const {Pool}=require('pg'),fake=new Pool({...pool.options,Client,idleTimeoutMillis:0});
 const held=await Promise.all(Array.from({length:5},()=>fake.connect()));
 const started=Date.now(),keepAlive=setInterval(()=>{},1000);
 try {await assert.rejects(()=>fake.connect(),{message:'timeout exceeded when trying to connect'});assert.equal(fake.waitingCount,0);assert.ok(Date.now()-started>=11_500);}
 finally{clearInterval(keepAlive);held.forEach(client=>client.release());}
 const later=await fake.connect();later.release();assert.equal(fake.totalCount,fake.idleCount);await fake.end();
 console.log('POOL_SATURATION timeout="timeout exceeded when trying to connect" elapsed>=11500ms waiting=0 later_checkout=PASS');
}
async function enterpriseChainTests(api,reference,bindings,detailTx,id){
 let active=false,checkedOut=0;const events=[];
 const tx={release:()=>{assert.equal(active,false);checkedOut--;events.push('release');},query:async(sql,args)=>{
  if(sql.startsWith('BEGIN')){assert.equal(active,false);active=true;events.push('BEGIN');return {rows:[]};}
  if(sql==='COMMIT'||sql==='ROLLBACK'){assert.equal(active,true);active=false;events.push(sql);return {rows:[]};}
  if(sql.includes('FROM app_enterprise_settings s JOIN'))return {rows:[{id:'enterprise',name:'fixture',owner_email:'owner@example.test',enabled:true,enterprise_enabled:true}]};
  if(sql.includes('SELECT banned'))return {rows:[{banned:false}]};
  if(sql.includes('app_enterprise_roles')||sql.includes('app_enterprise_members')||sql.includes('app_tenant_entitlements'))return {rows:[]};
  return detailTx.query(sql,args);
 }};
 const pool={options:{max:5},connect:async()=>{assert.equal(checkedOut,0,'second checkout');checkedOut++;return tx;},query:async()=>{assert.equal(active,false,'schema/pool query inside transaction');return {rows:[]};}};
 const team=bindings['@/lib/teams/server'];
 const hierarchy=load('src/lib/enterprise/hierarchy.ts',{'@/lib/teams/errors':team});
 const server=load('src/lib/enterprise/server.ts',{'./hierarchy':hierarchy,'./site-administrator':{administeredSite:async()=>null,siteAdministrators:async()=>[]},'@/lib/site-control/identity':{},'./workflow-permissions':{workflowPermissionsSchema:require('zod').z.array(require('zod').z.string())},'@/lib/enterprise/schema':{ensureEnterpriseSchema:async()=>{}},'@/lib/teams/server':{...team,ensureTeamSchema:async()=>{}},'@/lib/teams/grants':{requireTeamGrant:async()=>({expires_at:null})},'@/lib/db':{getPool:()=>pool},'@/platform/db/owned-read-client':load('src/platform/db/owned-read-client.ts'),'@/lib/settings-secret':{},'./integration/policy':{pinnedEnterpriseIds:()=>[],IntegrationError:class extends Error{}}});
 const publicParameters=load('src/lib/saas/creation-parameters.ts');
 const history=load('src/lib/enterprise/creation-history.ts',{'./server':server,'@/lib/teams/server':team,'@/lib/bi/repository':{ensureBiSchema:async()=>{assert.equal(active,false);}},'@/lib/media-assets':{ensureMediaSchema:async()=>{assert.equal(active,false);events.push('schema');}},'@/lib/saas/legacy-creations':api,'@/lib/saas/creation-parameters':publicParameters,'@/lib/saas/creation-writer':publicParameters});
 const actor={email:'owner@example.test',admin:true};
 const filters={page:1,size:24,user:'',q:'',period:'all'};
 assert.equal((await history.enterpriseHistory(actor,'enterprise',filters)).scope,'member');
 const detail=await history.enterpriseHistoryDetail(actor,'enterprise',id,1);assert.equal(detail.technical,undefined);assert.equal(detail.assets.length,1);
 const media=await history.enterpriseHistoryAsset(actor,'enterprise',id,'legacy-media-0');
 assert.equal(active,false);assert.equal(checkedOut,0);assert.match(media.url,/^\/media\/imagegen-inputs\//);
 const route=fs.readFileSync(path.join(root,'src/lib/saas/creation-http.ts'),'utf8');assert.match(route,/await enterpriseHistoryAsset[\s\S]*?enterpriseMediaResponse\(request,media.url\)/);
 assert.ok(events.indexOf('schema')<events.lastIndexOf('BEGIN'));assert.equal(events.at(-1),'release');

 // Exercise actual HTTP orchestration and image renderer after the real
 // owned snapshot and permission recheck, with only auth/storage/DB ports mocked.
 const {NextResponse}=require('next/server'),json=(value,status=200)=>NextResponse.json(value,{status});
 const png=await require('sharp')({create:{width:2,height:2,channels:4,background:'#ffffff'}}).png().toBuffer();
 const preview=load('src/lib/media-preview.ts',{'@/lib/storage':{isManagedImageUrl:url=>url.startsWith('/media/'),dataUrlToBytes:()=>null,readManagedObject:async()=>{assert.equal(active,false);assert.equal(checkedOut,0);events.push('body');return {bytes:png};}},'@/lib/download-source':{},'@/lib/media-cache-version':{},'./media-preview-budget':load('src/lib/media-preview-budget.ts')});
 const renderer=load('src/lib/enterprise/media-response.ts',{'next/server':{NextResponse},'@/lib/teams/access':{teamJson:json,PRIVATE_HEADERS:{}},'@/lib/media-preview':preview});
 const http=load('src/lib/saas/creation-http.ts',{'next/server':{NextResponse},'./tenants':{},'@/lib/enterprise/access':{enterpriseAuthorize:async()=>actor},'@/lib/teams/access':{teamJson:json},'@/lib/teams/server':team,'./creation-contracts':load('src/lib/saas/creation-contracts.ts'),'./creations':{},'@/lib/enterprise/media-stream':{},'@/lib/enterprise/media-response':renderer,'./legacy-creations':api,'./creation-playback':{},'@/lib/feature-access/server':{},'@/lib/feature-access/catalog':{},'@/lib/enterprise/creation-history':history});
 const request=new Request('http://fixture.test/api/enterprise/creations?tenantId=11111111-1111-4111-8111-111111111111&source=legacy');
 assert.equal((await http.creationListRoute(request,true)).status,200);
 const detailResponse=await http.creationDetailRoute(request,id,true);assert.equal(detailResponse.status,200);assert.equal((await detailResponse.json()).assets.length,1);
 const beforeAsset=events.length;
 const assetResponse=await http.creationAssetRoute(request,id,'legacy-media-0',true);assert.equal(assetResponse.status,200);assert.equal(assetResponse.headers.get('content-type'),'image/webp');assert.ok((await assetResponse.arrayBuffer()).byteLength>0);
 assert.deepEqual(events.slice(beforeAsset),['schema','BEGIN','COMMIT','BEGIN','COMMIT','release','body']);
 console.log('ENTERPRISE_HTTP records=200 detail=200 asset=200/webp bytes_after_release=PASS');
 const absent={query:async()=>({rows:[]})};await assert.rejects(()=>reference.readImagegenInputAssetReference('asset-11111111-1111-1111-1111-111111111111','other@example.test',absent),/\u7d20\u6750\u4e0d\u5b58\u5728\u6216\u65e0\u6743\u8bbf\u95ee/);
 console.log('ENTERPRISE_CHAIN records/detail/assets snapshot_and_recheck=PASS schema_before_begin=PASS media_after_release=PASS');
}

main().catch(e=>{console.error(e);process.exitCode=1;});
