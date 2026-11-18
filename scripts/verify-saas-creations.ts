import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const base=new URL(process.env.DATABASE_URL!);assert.equal(base.hostname,'127.0.0.1');assert.match(base.pathname,/fixture/);
 const name=`saas_creation_fixture_${Date.now()}`;const adminPool=new Pool({connectionString:base.toString()});await adminPool.query(`CREATE DATABASE ${name}`);await adminPool.end();base.pathname=`/${name}`;process.env.DATABASE_URL=base.toString();
 const db=await import('../src/lib/db'),tenants=await import('../src/lib/saas/tenants'),schema=await import('../src/lib/saas/creation-schema'),native=await import('../src/lib/native-auth');
 const adminRoutes=await import('../src/app/api/admin/creations/route'),adminDetail=await import('../src/app/api/admin/creations/[id]/route'),enterpriseRoutes=await import('../src/app/api/enterprise/creations/route'),enterpriseDetail=await import('../src/app/api/enterprise/creations/[id]/route'),mediaRoute=await import('../src/app/api/enterprise/creations/[id]/assets/[assetId]/route'),contracts=await import('../src/lib/saas/creation-contracts'),storage=await import('../src/lib/storage');
 const adminEvents=await import('../src/app/api/admin/creations/[id]/events/route'),enterpriseEvents=await import('../src/app/api/enterprise/creations/[id]/events/route');
 await tenants.ensureTenantSchema();await schema.ensureCreationSchema();const pool=db.getPool();
 // Initialize the actual Worker-owned UUID schema before reading any creation.
 const batches=await import('../src/lib/imagegen/batch-repository');await batches.ensureImagegenBatches();
 const batchIdType=(await pool.query("SELECT format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a WHERE a.attrelid='app_imagegen_batches'::regclass AND a.attname='id' AND NOT a.attisdropped")).rows[0].type;assert.equal(batchIdType,'uuid');
 const emails=['admin','ownerA','ownerB','manager','member','departed'].map(s=>`${s.toLowerCase()}@creation.fixture`),[admin,ownerA,ownerB,manager,member,departed]=emails;
 for(const email of emails){
  await db.getOrCreateUser(email,email);
  await pool.query("INSERT INTO app_feature_access(email,mode,allowed)VALUES($1,'custom','[\"team\"]') ON CONFLICT(email) DO UPDATE SET mode=excluded.mode,allowed=excluded.allowed",[email]);
 }
 await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
 const actor={email:admin,admin:true,consoleAdmin:true};const create=(ownerEmail:string)=>tenants.createTenant(actor,{commandId:randomUUID(),name:`Fixture ${ownerEmail}`,ownerEmail,validUntil:null,seatLimit:10,entitlementName:null,featurePolicy:{video:false}});
 const a=await create(ownerA),b=await create(ownerB),role=randomUUID();await pool.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,'Manager',10,true,true)",[a.tenantId,role]);
 await pool.query("UPDATE app_team_access_grants SET starts_at=now()-interval '1 day' WHERE email=ANY($1::text[])",[[ownerA,ownerB]]);
 await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent'),($1,$5,$2,NULL,'permanent'),($1,$6,$3,NULL,'permanent')",[a.tenantId,manager,ownerA,role,member,departed]);
 const root=`cr-${randomUUID()}`,child=`cr-${randomUUID()}`,foreign=`cr-${randomUUID()}`,unknown=`cr-${randomUUID()}`,archived=`cr-${randomUUID()}`;
 const record=async(id:string,email:string,tenant:string,parent:string|null=null,status='succeeded')=>pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,payer_account_id,source_kind,source_id,parent_id,status,request_snapshot,parameters_snapshot,model_snapshot) VALUES($1,$2,'tenant',$3,$2,'fixture',$1,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,[id,email,tenant,parent,status,JSON.stringify({state:'recorded',text:'真实输入 fixture'}),JSON.stringify({state:'recorded',values:{ratio:'1:1',count:0,moderation:false,providerId:'INTERNAL_PROVIDER',modelId:'INTERNAL_MODEL',nested:{apiKey:'INTERNAL_SECRET'}}}),JSON.stringify({state:'recorded',label:'客户显示名fixture'})]);
 await record(root,member,a.tenantId);await record(child,member,a.tenantId,root);await record(foreign,ownerB,b.tenantId);await record(unknown,member,a.tenantId,null,'needs_review');await record(archived,departed,a.tenantId);
 const operation=`op-${randomUUID()}`;await pool.query("INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,charged_credits,ledger_id) VALUES($1,$2,'fixture',$3::jsonb,'fixture','settled',0,$4)",[operation,member,JSON.stringify({requestedCredits:0,reserveCredits:2}),`led-${operation}`]);
 for(const id of [root,child])await pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email,reserved_credits,released_credits) VALUES($1,'billing',$2,$3,2,2)",[id,operation,member]);
 await pool.query("INSERT INTO app_billing_api_cost_reviews(id,operation_id,after_result,status,refund_credits) VALUES($1,$2,'{}','refunded',1)",[`review-${randomUUID()}`,operation]);
 const mediaIds:string[]=[];await storage.writeStoredObject(Buffer.from('fixture-video-bytes'),'video/mp4','creation-fixture/video.mp4');
 for(let i=0;i<29;i++){const id=`ca-${randomUUID()}`;mediaIds.push(id);await pool.query("INSERT INTO app_creation_assets(id,creation_id,direction,role,position,storage_ref,actor_email,media_type,mime) VALUES($1,$2,'output','result',$3,'/media/creation-fixture/video.mp4',$4,'video','video/mp4')",[id,i%2?root:child,i,member]);}
 const badAsset=`ca-${randomUUID()}`;await pool.query("INSERT INTO app_creation_assets(id,creation_id,direction,role,storage_ref,actor_email) VALUES($1,$2,'input','reference','http://127.0.0.1:1234/private',$3)",[badAsset,root,member]);
 for(let i=0;i<31;i++)await pool.query("INSERT INTO app_creation_events(id,creation_id,event_key,type,status,summary) VALUES($1,$2,$3,'execution','succeeded','INTERNAL_PROVIDER upstream trace')",[`ev-${randomUUID()}`,root,`fixture-${i}`]);
 const cookie=(email:string)=>`nv_user=${native.signUserSession(email,Date.now())}`;
 const request=(path:string,email?:string,headers:Record<string,string>={})=>new Request(`http://fixture.test${path}`,{headers:{...(email?{cookie:cookie(email)}:{}),...headers}});
 const detailCtx=(id:string)=>({params:Promise.resolve({id})});
 // Prove that the old full-detail path really waits on the named dependency,
 // then exercise the narrow route while the identical lock is still held.
 const whileDetailWaits=async(table:'app_creation_assets'|'app_billing_operations',readDetail:()=>Promise<Response>,readProjection:()=>Promise<void>)=>{
  const lock=await pool.connect();let pending:Promise<Response>|undefined;
  try{
   await lock.query('BEGIN');await lock.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);pending=readDetail();
   const deadline=Date.now()+4000;
   while(!(await lock.query('SELECT EXISTS(SELECT 1 FROM pg_locks WHERE relation=$1::regclass AND NOT granted) AS waiting',[table])).rows[0].waiting){
    assert.ok(Date.now()<deadline,`Full detail did not reach the locked ${table} table`);await new Promise(resolve=>setTimeout(resolve,20));
   }
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{await Promise.race([readProjection(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(`Projection waited on locked ${table}`)),2500);})]);}
   finally{clearTimeout(timer);}
  }finally{await lock.query('ROLLBACK');lock.release();}
  assert.equal((await pending).status,200);
 };
 assert.ok([401,403].includes((await adminRoutes.GET(request('/api/admin/creations'))).status));
 const list=await enterpriseRoutes.GET(request(`/api/enterprise/creations?tenantId=${a.tenantId}`,ownerA));assert.equal(list.status,200);assert.match(list.headers.get('cache-control')||'',/private.*no-store/);const listing=await list.json();assert.equal(listing.pagination.total,3);assert.equal(listing.items.find((x:any)=>x.id===root).settledCredits,0);assert.equal(listing.items.find((x:any)=>x.id===unknown).settledCredits,null);
 const detail=await enterpriseDetail.GET(request(`/api/enterprise/creations/${root}?tenantId=${a.tenantId}`,ownerA),detailCtx(root));assert.equal(detail.status,200);const full=await detail.json();assert.doesNotMatch(JSON.stringify(full),/INTERNAL_PROVIDER|INTERNAL_MODEL|INTERNAL_SECRET|providerId|modelId|apiKey|technical/);assert.equal(full.parameters.values.count,0);assert.equal(full.parameters.values.moderation,false);assert.equal(full.billing.quoted,0);assert.equal(full.billing.reserved,2);assert.equal(full.billing.released,2);assert.equal(full.billing.charged,0);assert.equal(full.billing.refunded,1);assert.equal(full.children.length,1);assert.equal(full.assetPagination.total,30);assert.equal(full.assets.length,24);assert.equal(full.eventPagination.total,31);
 const second=await(await enterpriseDetail.GET(request(`/api/enterprise/creations/${root}?tenantId=${a.tenantId}&assetPage=2&eventPage=2`,ownerA),detailCtx(root))).json();assert.equal(second.assets.length,6);assert.equal(second.events.length,7);
 const assetBaseline=process.argv.includes('--asset-projection-baseline'),verifyAssetProjection=assetBaseline||process.argv.includes('--asset-projection');
 const projectedAssetPage=(id:string,num:number,scoped=false)=>scoped
  ?enterpriseDetail.GET(request(`/api/enterprise/creations/${id}?tenantId=${a.tenantId}&assetPage=${num}&projection=assets`,ownerA),detailCtx(id))
  :adminDetail.GET(request(`/api/admin/creations/${id}?assetPage=${num}&projection=assets`,admin),detailCtx(id));
 const sameAssets=async(response:Response,reference:{assets:unknown;assetPagination:unknown})=>{
  const body=await response.json();
  assert.equal(response.status,200,JSON.stringify(body));
  assert.deepEqual(body,{assets:reference.assets,assetPagination:reference.assetPagination});
 };
 if(verifyAssetProjection){
  const locked=await pool.connect();
  try{
   await locked.query('BEGIN; LOCK TABLE app_billing_operations,app_creation_events IN ACCESS EXCLUSIVE MODE');
   if(assetBaseline){
    assert.equal((await projectedAssetPage(root,2,true)).status,503);
    console.log('CREATION_ASSET_PAGE_BASELINE=PASS UNRELATED_TABLES_BLOCK=1');
   }else await sameAssets(await projectedAssetPage(root,2,true),second);
  }finally{await locked.query('ROLLBACK');locked.release();}
  if(!assetBaseline)assert.equal((await projectedAssetPage(foreign,1,true)).status,404);
 }
 const unknownDetail=await(await enterpriseDetail.GET(request(`/api/enterprise/creations/${unknown}?tenantId=${a.tenantId}`,ownerA),detailCtx(unknown))).json();for(const key of ['quoted','reserved','released','charged','refunded'])assert.equal(unknownDetail.billing[key],null);
 const adminFull=await(await adminDetail.GET(request(`/api/admin/creations/${root}`,admin),detailCtx(root))).json();assert.equal(adminFull.technical.sourceKind,'fixture');assert.equal(adminFull.parameters.values.providerId,'INTERNAL_PROVIDER');
 const adminEventsPath=`/api/admin/creations/${root}/events`,enterpriseEventsPath=`/api/enterprise/creations/${root}/events?tenantId=${a.tenantId}`;
 const readEvents=()=>enterpriseEvents.GET(request(enterpriseEventsPath+'&eventPage=2',ownerA),detailCtx(root));
 const events=await readEvents();assert.equal(events.status,200);assert.match(events.headers.get('cache-control')||'',/private.*no-store/);
 const eventBody=await events.json();assert.deepEqual(eventBody.items,second.events);assert.ok(Number.isFinite(Date.parse(eventBody.generatedAt)));assert.doesNotMatch(JSON.stringify(eventBody),/INTERNAL_PROVIDER|fixture-\d+/);
 assert.deepEqual((await (await adminEvents.GET(request(adminEventsPath,admin),detailCtx(root))).json()).items,adminFull.events);
 assert.ok([401,403].includes((await adminEvents.GET(request(adminEventsPath),detailCtx(root))).status));
 assert.equal((await enterpriseEvents.GET(request(enterpriseEventsPath+'&assetPage=0',ownerA),detailCtx(root))).status,400);
 assert.deepEqual((await (await enterpriseEvents.GET(request(enterpriseEventsPath+'&eventPage=3',ownerA),detailCtx(root))).json()).items,[]);
 assert.equal((await enterpriseEvents.GET(request(enterpriseEventsPath,ownerA),detailCtx(foreign))).status,404);
 await whileDetailWaits('app_creation_assets',()=>enterpriseDetail.GET(request(`/api/enterprise/creations/${root}?tenantId=${a.tenantId}&eventPage=2`,ownerA),detailCtx(root)),async()=>{
  const eventResult=await readEvents();assert.equal(eventResult.status,200);assert.deepEqual((await eventResult.json()).items,second.events);
 });
 if(process.env.NAUMI_VERIFY_CREATION_QUERY_STATS==='1'){
  await pool.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
  const measure=async(run:()=>Promise<Response>)=>{
   await pool.query('SELECT pg_stat_statements_reset()');const response=await run();assert.equal(response.status,200);await response.json();
   const {rows}=await pool.query("SELECT COALESCE(sum(calls),0)::int AS total,COALESCE(sum(calls) FILTER(WHERE query ~ 'app_creation_assets|app_billing_operations'),0)::int AS irrelevant FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND query ~* '^(select|with)\\s' AND query NOT LIKE '%pg_stat_statements%'");return rows[0];
  };
  const detail=await measure(()=>enterpriseDetail.GET(request(`/api/enterprise/creations/${root}?tenantId=${a.tenantId}&eventPage=2`,ownerA),detailCtx(root)));
  const events=await measure(readEvents);assert.ok(events.total<detail.total);assert.ok(detail.irrelevant>0);assert.equal(events.irrelevant,0);
  console.log('CREATION_EVENT_QUERY_STATS',JSON.stringify({detail,events}));
 }
 assert.equal((await enterpriseDetail.GET(request(`/api/enterprise/creations/${foreign}?tenantId=${a.tenantId}`,ownerA),detailCtx(foreign))).status,404);
 assert.equal((await enterpriseRoutes.GET(request(`/api/enterprise/creations?tenantId=${b.tenantId}`,ownerA))).status,403);
 const mediaCtx={params:Promise.resolve({id:root,assetId:mediaIds[0]})};const range=await mediaRoute.GET(request(`/api/enterprise/creations/${root}/assets/${mediaIds[0]}?tenantId=${a.tenantId}`,ownerA,{range:'bytes=0-6'}),mediaCtx);assert.equal(range.status,206);assert.equal(await range.text(),'fixture');assert.match(range.headers.get('cache-control')||'',/private.*no-store/);
 const playbackPath=`/api/enterprise/creations/${root}/assets/${mediaIds[0]}?tenantId=${a.tenantId}&playback=1`;
 assert.equal((await mediaRoute.GET(request(playbackPath),mediaCtx)).status,401);
 const playbackResponse=await mediaRoute.GET(request(playbackPath,manager),mediaCtx);assert.equal(playbackResponse.status,200);const playback=await playbackResponse.json();assert.ok(playback.url.includes('mediaToken='));
 const publicRange=await mediaRoute.GET(request(playback.url,undefined,{range:'bytes=0-6'}),mediaCtx);assert.equal(publicRange.status,206);assert.equal(await publicRange.text(),'fixture');
 assert.equal((await mediaRoute.GET(request(playback.url+'tampered'),mediaCtx)).status,401);
 const playbackContract=await import('../src/lib/saas/creation-playback');const expired=playbackContract.creationPlaybackToken(member,a.tenantId,root,mediaIds[0],Date.now()-11*60_000);
 assert.equal((await mediaRoute.GET(request(`/api/enterprise/creations/${root}/assets/${mediaIds[0]}?tenantId=${a.tenantId}&mediaToken=${expired}`),mediaCtx)).status,401);
 assert.equal((await mediaRoute.GET(request(`/api/enterprise/creations/${root}/assets/${badAsset}?tenantId=${a.tenantId}`,ownerA),{params:Promise.resolve({id:root,assetId:badAsset})})).status,422);
 const badMediaCtx={params:Promise.resolve({id:root,assetId:badAsset})},badMediaRequest=()=>request(`/api/enterprise/creations/${root}/assets/${badAsset}?tenantId=${a.tenantId}`,ownerA);
 await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,deleted_at) VALUES('deleted-evidence-input',$1,'fixture','fixture','','/media/missing.png','',now())",[member]);
 await pool.query("UPDATE app_creation_assets SET storage_ref='artwork:deleted-evidence-input' WHERE id=$1",[badAsset]);assert.equal((await mediaRoute.GET(badMediaRequest(),badMediaCtx)).status,404);
 await storage.writeStoredObject(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><script>alert(1)</script><rect width="8" height="8" fill="red"/></svg>'),'image/svg+xml','creation-fixture/unsafe.svg');
 await pool.query("UPDATE app_creation_assets SET storage_ref='/media/creation-fixture/unsafe.svg' WHERE id=$1",[badAsset]);const safeSvg=await mediaRoute.GET(badMediaRequest(),badMediaCtx);assert.equal(safeSvg.status,200);assert.equal(safeSvg.headers.get('content-type'),'image/webp');assert.doesNotMatch(Buffer.from(await safeSvg.arrayBuffer()).toString('utf8'),/<script|alert\(/);
 // Input asset metadata must use the same authorization transaction. With all
 // other pool slots held, the route must still reach the HTTP media renderer.
 const assetId=`ca-${randomUUID()}`,inputId=randomUUID(),inputKey=`imagegen-inputs/${inputId}.png`;
 const {ensureMediaSchema}=await import('../src/lib/media-assets-schema');await ensureMediaSchema();
 const png=await (await import('sharp')).default({create:{width:8,height:8,channels:4,background:'#abc'}}).png().toBuffer();
 await storage.writeStoredObject(png,'image/png',inputKey);
 await pool.query("INSERT INTO app_media_assets(key,owner,driver,content_type,sha256,bytes) VALUES($1,$2,'local','image/png','fixture',$3)",[inputKey,member,png.length]);
 await pool.query("INSERT INTO app_creation_assets(id,creation_id,direction,role,storage_ref,actor_email,mime) VALUES($1,$2,'input','mask',$3,$4,'image/png')",[assetId,root,`artwork:asset-${inputId}`,member]);
 const pngRequest=()=>request(`/api/enterprise/creations/${root}/assets/${assetId}?tenantId=${a.tenantId}`,ownerA);
 const pngContext={params:Promise.resolve({id:root,assetId})};
 const held=await Promise.all(Array.from({length:(pool.options.max??5)-1},()=>pool.connect()));
 let assetDeadline:ReturnType<typeof setTimeout>|undefined;
 try{
  const image=await Promise.race([mediaRoute.GET(pngRequest(),pngContext),new Promise<never>((_,reject)=>{assetDeadline=setTimeout(()=>reject(Error('Asset waited for a second pool connection')),2500);})]);
  assert.equal(image.status,200);assert.match(image.headers.get('content-type')||'',/^image\//);
 }finally{clearTimeout(assetDeadline);held.forEach(client=>client.release());}
 await pool.query('UPDATE app_media_assets SET owner=$2 WHERE key=$1',[inputKey,ownerB]);assert.equal((await mediaRoute.GET(pngRequest(),pngContext)).status,503);
 await pool.query('DELETE FROM app_creation_assets WHERE id=$1',[assetId]);
 console.log('CREATION_INPUT_ASSET_PASS remaining_pool_slots=1 owned_reference=200 cross_owner_denied=1');
 await storage.writeStoredObject(Buffer.from('<html><script>alert(1)</script></html>'),'text/html','creation-fixture/unsafe.html');
 for(const path of ['/media/creation-fixture/unsafe.html','/media/../../private']){await pool.query('UPDATE app_creation_assets SET storage_ref=$2 WHERE id=$1',[badAsset,path]);assert.equal((await mediaRoute.GET(badMediaRequest(),badMediaCtx)).status,422);}
 const ledgerBefore=(await pool.query('SELECT count(*) n FROM app_ledger')).rows[0].n,recordsBefore=(await pool.query('SELECT count(*) n FROM app_creation_records')).rows[0].n,originalFetch=globalThis.fetch;let unexpectedFetches=0;
 try{globalThis.fetch=async()=>{unexpectedFetches++;throw new Error('Read-only evidence must not call a supplier');};for(let i=0;i<2;i++)assert.equal((await enterpriseDetail.GET(request(`/api/enterprise/creations/${root}?tenantId=${a.tenantId}`,ownerA),detailCtx(root))).status,200);assert.equal(unexpectedFetches,0);}finally{globalThis.fetch=originalFetch;}
 assert.equal((await pool.query('SELECT count(*) n FROM app_ledger')).rows[0].n,ledgerBefore);assert.equal((await pool.query('SELECT count(*) n FROM app_creation_records')).rows[0].n,recordsBefore);assert.equal((await pool.query('SELECT status FROM app_creation_records WHERE id=$1',[root])).rows[0].status,'succeeded');
 await pool.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE email=ANY($1::text[])",[[member,departed]]);
 assert.equal((await mediaRoute.GET(request(playback.url,undefined,{range:'bytes=0-6'}),mediaCtx)).status,404);
 assert.equal((await enterpriseDetail.GET(request(`/api/enterprise/creations/${root}?tenantId=${a.tenantId}`,member),detailCtx(root))).status,403);
 assert.equal((await enterpriseDetail.GET(request(`/api/enterprise/creations/${root}?tenantId=${a.tenantId}`,manager),detailCtx(root))).status,404);
 assert.equal((await enterpriseEvents.GET(request(enterpriseEventsPath,manager),detailCtx(root))).status,404);
 assert.equal((await enterpriseDetail.GET(request(`/api/enterprise/creations/${archived}?tenantId=${a.tenantId}`,ownerA),detailCtx(archived))).status,200);
 assert.equal((await mediaRoute.GET(request(`/api/enterprise/creations/${root}/assets/${mediaIds[0]}?tenantId=${a.tenantId}`,member),mediaCtx)).status,403);
 assert.equal(contracts.creationFiltersSchema.safeParse({from:'2026-02-30'}).success,false);assert.equal(contracts.creationFiltersSchema.safeParse({page:0}).success,false);
 const legacyJob=`legacy-job-${randomUUID()}`;await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,billing_settled) VALUES($1,$2,'generate','{\"status\":\"done\"}',$3::jsonb,false,true)",[legacyJob,departed,JSON.stringify({p:{prompt:'旧图片原话 fixture'}})]);
 const legacyList=await(await adminRoutes.GET(request('/api/admin/creations?source=legacy',admin))).json();const legacy=legacyList.items.find((x:any)=>x.actorEmail===departed);assert.ok(legacy);assert.equal(legacy.scopeKind,'legacy_unconfirmed');assert.equal(legacy.tenantId,null);
 // Exercise historical visibility through the real authorized route, not a
 // fixture-only query. Original code is also runnable as a rollback baseline.
 const historyVisible=process.env.NAUMI_VERIFY_HISTORY_ENTRY_EXPECTED!=='hidden';
 const ancient=`ancient-${randomUUID()}`;await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,billing_settled,created_at) VALUES($1,$2,'generate','{\"status\":\"done\"}','{}',false,true,'2001-01-01T00:00:00Z')",[ancient,departed]);
 const historyRequest=`/api/admin/creations?source=legacy&user=${encodeURIComponent(departed)}`;
 const historyDefault=await(await adminRoutes.GET(request(historyRequest,admin))).json();
 const historyHasOld=historyDefault.items.some((x:any)=>x.acceptedAt.startsWith('2001-01-01'));
 assert.equal(historyHasOld,historyVisible,'default history must not silently hide old generations');
 if(historyVisible){
  assert.equal(historyDefault.appliedFilters.period,'all');
  const all=await(await adminRoutes.GET(request(historyRequest+'&period=all',admin))).json();assert.equal(all.pagination.total,historyDefault.pagination.total);
  const dated=await(await adminRoutes.GET(request(historyRequest+'&from=2001-01-01&to=2001-01-01',admin))).json();assert.equal(dated.pagination.total,1);
  const recent=await(await adminRoutes.GET(request(historyRequest+'&from=2026-10-01&to=2026-10-31',admin))).json();assert.ok(recent.items.every((x:any)=>!x.acceptedAt.startsWith('2001-')));
  assert.equal((await adminRoutes.GET(request(historyRequest+'&period=all&from=2001-01-01',admin))).status,400);
  assert.equal((await adminRoutes.GET(request(historyRequest+'&period=invalid',admin))).status,400);
  const ordinary=await(await adminRoutes.GET(request('/api/admin/creations',admin))).json();assert.ok(ordinary.appliedFilters.from);assert.equal(ordinary.appliedFilters.period,undefined);
 }
 assert.equal((await adminRoutes.GET(request(historyRequest+`&tenantId=${a.tenantId}`,admin))).status,400);
 const enterpriseHistoryResponse=await enterpriseRoutes.GET(request(`/api/enterprise/creations?tenantId=${a.tenantId}&source=legacy&period=all`,ownerA));assert.equal(enterpriseHistoryResponse.status,200);const enterpriseHistoryBody=await enterpriseHistoryResponse.json();assert.equal(enterpriseHistoryBody.scope,'member');assert.ok(enterpriseHistoryBody.items.every((item:any)=>item.actorEmail!==departed&&item.actorEmail!==ownerB));
 assert.ok([401,403].includes((await adminRoutes.GET(request(historyRequest+'&period=all'))).status));
 console.log(`HISTORY_ENTRY_STATE=${historyVisible?'VISIBLE':'HIDDEN'} oldJobVisible=${historyHasOld} real_route=1 scope_preserved=1`);
 const legacyFull=await(await adminDetail.GET(request(`/api/admin/creations/${legacy.id}`,admin),detailCtx(legacy.id))).json();assert.equal(legacyFull.request.text,'旧图片原话 fixture');assert.equal(legacyFull.model.state,'not_recorded');assert.equal(legacyFull.billing.charged,0);assert.equal(legacyFull.events.length,0);
 assert.deepEqual((await (await adminEvents.GET(request(`/api/admin/creations/${legacy.id}/events`,admin),detailCtx(legacy.id))).json()).items,[]);
 assert.equal((await enterpriseEvents.GET(request(`/api/enterprise/creations/${legacy.id}/events?tenantId=${a.tenantId}`,ownerA),detailCtx(legacy.id))).status,404);
 assert.equal((await enterpriseDetail.GET(request(`/api/enterprise/creations/${legacy.id}?tenantId=${a.tenantId}`,ownerA),detailCtx(legacy.id))).status,404);
 await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,batch_id)
  SELECT 'legacy-output-'||$1||'-'||n,$2,'fixture output','fixture','','/media/creation-fixture/video.mp4','',$1 FROM generate_series(1,107)n`,[legacyJob,departed]);
 const lastLegacy=await(await adminDetail.GET(request(`/api/admin/creations/${legacy.id}?assetPage=5`,admin),detailCtx(legacy.id))).json();assert.equal(lastLegacy.assetPagination.total,107);assert.equal(lastLegacy.assets.length,11);assert.equal(lastLegacy.assetPagination.page,5);
 if(verifyAssetProjection&&!assetBaseline)await sameAssets(await projectedAssetPage(legacy.id,5),lastLegacy);
 const legacyReader=await import('../src/lib/saas/legacy-creations');assert.equal((await legacyReader.legacyCreationAsset(legacy.id,lastLegacy.assets[10].id)).url,'/media/creation-fixture/video.mp4');
 const platformMedia=await import('../src/app/api/admin/creations/[id]/assets/[assetId]/route');
 const lastLegacyAsset=lastLegacy.assets[10].id,ownedOutput=Buffer.from(lastLegacyAsset.slice('legacy-artwork-'.length),'base64url').toString();
 await pool.query('UPDATE app_artworks SET video_url=image_url WHERE id=$1',[ownedOutput]);
 const legacyAssetRoute=(assetId:string,email=admin)=>platformMedia.GET(request(`/api/admin/creations/${legacy.id}/assets/${assetId}`,email,{range:'bytes=0-6'}),{params:Promise.resolve({id:legacy.id,assetId})});
 await whileDetailWaits('app_billing_operations',()=>adminDetail.GET(request(`/api/admin/creations/${legacy.id}?assetPage=5`,admin),detailCtx(legacy.id)),async()=>{
  const image=await legacyAssetRoute(lastLegacyAsset);assert.equal(image.status,206);assert.equal(await image.text(),'fixture');
 });
 await pool.query('UPDATE app_artworks SET deleted_at=now() WHERE id=$1',[ownedOutput]);
 assert.equal((await legacyAssetRoute(lastLegacyAsset)).status,404);
 const unrelatedOutput=`unrelated-${randomUUID()}`;
 await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient) VALUES($1,$2,'Unrelated','fixture','','/media/creation-fixture/video.mp4','')",[unrelatedOutput,departed]);
 assert.equal((await legacyAssetRoute(`legacy-artwork-${Buffer.from(unrelatedOutput).toString('base64url')}`)).status,404);
 const historicInput='/media/creation-fixture/archived-input.png';await storage.writeStoredObject(png,'image/png','creation-fixture/archived-input.png');
 await pool.query("UPDATE app_image_jobs SET payload=jsonb_set(payload,'{p,images}',$2::jsonb) WHERE id=$1",[legacyJob,JSON.stringify(Array.from({length:30},()=>({buf:{$imageJobBuffer:historicInput}})))]);
 const inputPage=await(await adminDetail.GET(request(`/api/admin/creations/${legacy.id}?assetPage=2`,admin),detailCtx(legacy.id))).json();
 assert.equal(inputPage.assets[1].id,'legacy-media-25');
 const enterpriseLegacyInput=()=>mediaRoute.GET(request(`/api/enterprise/creations/${legacy.id}/assets/legacy-media-25?tenantId=${a.tenantId}`,ownerA),{params:Promise.resolve({id:legacy.id,assetId:'legacy-media-25'})});
 assert.equal((await enterpriseLegacyInput()).status,404);
 await pool.query("UPDATE app_enterprise_members SET membership_status='active' WHERE email=$1",[departed]);
 try{
  await whileDetailWaits('app_billing_operations',()=>adminDetail.GET(request(`/api/admin/creations/${legacy.id}?assetPage=2`,admin),detailCtx(legacy.id)),async()=>{
   for(const read of [()=>legacyAssetRoute('legacy-media-25'),enterpriseLegacyInput]){const input=await read();assert.equal(input.status,200);assert.match(input.headers.get('content-type')||'',/^image\//);await input.arrayBuffer();}
  });
 }finally{await pool.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE email=$1",[departed]);}
 assert.equal((await legacyAssetRoute('legacy-media-025')).status,404);
 console.log('CREATION_PROJECTION_LOCK_PASS events_without_assets=1 deep_legacy_output_without_billing=1 platform_and_enterprise_input_without_billing=1');
 const pendingId=`cr-${randomUUID()}`,pendingJob=`pending-${randomUUID()}`,pendingWork=`work-${randomUUID()}`;
 await record(pendingId,departed,a.tenantId);await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient) VALUES($1,$2,'fixture','fixture','','/media/creation-fixture/video.mp4','')",[pendingWork,departed]);
 await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered) VALUES($1,$2,'generate',$3::jsonb,'{}',false)",[pendingJob,departed,JSON.stringify({status:'done',creationEvidencePending:true,images:[{id:pendingWork}]})]);
 await pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES($1,'image:generate',$2,$3)",[pendingId,pendingJob,departed]);
 const beforeCounts=(await pool.query("SELECT (SELECT count(*) FROM app_billing_operations)::int AS billing,(SELECT count(*) FROM app_creation_assets)::int AS assets,(SELECT count(*) FROM app_ledger)::int AS ledger")).rows[0];
 const recovered=await(await enterpriseDetail.GET(request(`/api/enterprise/creations/${pendingId}?tenantId=${a.tenantId}`,ownerA),detailCtx(pendingId))).json();assert.equal(recovered.evidencePending,true);assert.equal(recovered.status,'succeeded');assert.equal(recovered.assets.length,1);assert.match(recovered.assets[0].id,/^recovered-/);assert.equal(recovered.assets[0].evidenceRecordId,pendingId);
 const linkedHistory=legacyReader.legacyCreationId({table:'app_image_jobs',id:pendingJob,email:departed});
 if(verifyAssetProjection&&!assetBaseline){
  await sameAssets(await projectedAssetPage(linkedHistory,1),recovered);
  assert.equal((await projectedAssetPage(linkedHistory,1,true)).status,404);
  console.log('CREATION_ASSET_PAGE=PASS CANONICAL=1 OLD_HISTORY=1 RECOVERED_LOCATOR=1 OTHER_TABLES_LOCKED=1 CROSS_TENANT=1');
 }
 const linkedEvent=`ev-${randomUUID()}`;await pool.query("INSERT INTO app_creation_events(id,creation_id,event_key,type,status,summary) VALUES($1,$2,'linked-event','execution','succeeded','INTERNAL_PROVIDER historical')",[linkedEvent,pendingId]);
 const linkedItems=(await (await adminEvents.GET(request(`/api/admin/creations/${linkedHistory}/events`,admin),detailCtx(linkedHistory))).json()).items;
 assert.equal(linkedItems[0].id,linkedEvent);assert.equal(linkedItems[0].eventKey,'linked-event');
 await pool.query("UPDATE app_enterprise_members SET membership_status='active' WHERE email=$1",[departed]);
 try{
  const linkedPath=`/api/enterprise/creations/${linkedHistory}`;
  const linkedDetail=await (await enterpriseDetail.GET(request(`${linkedPath}?tenantId=${a.tenantId}`,ownerA),detailCtx(linkedHistory))).json();
  const linkedResponse=await enterpriseEvents.GET(request(`${linkedPath}/events?tenantId=${a.tenantId}`,ownerA),detailCtx(linkedHistory));
  assert.equal(linkedResponse.status,200);const body=await linkedResponse.json();assert.deepEqual(body.items,linkedDetail.events);assert.equal(body.items[0].id,linkedEvent);assert.doesNotMatch(JSON.stringify(body),/INTERNAL_PROVIDER|linked-event/);
 }finally{await pool.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE email=$1",[departed]);}
 const recoveredMedia=await(await import('../src/lib/saas/creations')).creationAsset({platform:false,actor:{email:ownerA,admin:false},tenantId:a.tenantId},pendingId,recovered.assets[0].id);assert.equal(recoveredMedia.url,'/media/creation-fixture/video.mp4');
 assert.deepEqual((await pool.query("SELECT (SELECT count(*) FROM app_billing_operations)::int AS billing,(SELECT count(*) FROM app_creation_assets)::int AS assets,(SELECT count(*) FROM app_ledger)::int AS ledger")).rows[0],beforeCounts);
 const foreignChild=`cr-${randomUUID()}`;await record(foreignChild,ownerB,b.tenantId,root);const safeFamily=await(await enterpriseDetail.GET(request(`/api/enterprise/creations/${root}?tenantId=${a.tenantId}`,ownerA),detailCtx(root))).json();assert.equal(safeFamily.childPagination.total,1);assert.equal(safeFamily.children.some((x:any)=>x.id===foreignChild),false);
 const adminPlaybackResponse=await platformMedia.GET(request(`/api/admin/creations/${root}/assets/${mediaIds[0]}?playback=1`,admin),mediaCtx);assert.equal(adminPlaybackResponse.status,200);
 const adminPlayback=await adminPlaybackResponse.json();const adminRange=await platformMedia.GET(request(adminPlayback.url,undefined,{range:'bytes=0-6'}),mediaCtx);assert.equal(adminRange.status,206);assert.equal(await adminRange.text(),'fixture');
 assert.equal((await mediaRoute.GET(request(adminPlayback.url),mediaCtx)).status,403);
 await pool.query("UPDATE app_users SET role='user' WHERE email=$1",[admin]);assert.equal((await platformMedia.GET(request(adminPlayback.url),mediaCtx)).status,403);await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
 const workflow=await import('../src/lib/video/workflow');await workflow.ensureVideoWorkflowSchema();const workflowId=randomUUID(),workflowRecord=`cr-${randomUUID()}`;
 await record(workflowRecord,departed,a.tenantId,null,'queued');await pool.query("UPDATE app_creation_records SET source_kind='video-workflow',source_id=$2 WHERE id=$1",[workflowRecord,workflowId]);
 await pool.query("INSERT INTO app_video_workflow_runs(id,email,project_key,plan,plan_digest,creation_evidence_pending) VALUES($1,$2,'tree:fixture','{}','fixture',true)",[workflowId,departed]);
 await pool.query("INSERT INTO app_video_workflow_run_nodes(run_id,node_id,status,result_assets) VALUES($1,'one','completed',$2::jsonb),($1,'two','blocked','[]')",[workflowId,JSON.stringify([{artworkId:pendingWork,kind:'video'}])]);
 await pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES($1,'video-workflow',$2,$3)",[workflowRecord,workflowId,departed]);
 const workflowRequest=()=>request(`/api/enterprise/creations/${workflowRecord}?tenantId=${a.tenantId}`,ownerA);
 const partialWorkflow=await(await enterpriseDetail.GET(workflowRequest(),detailCtx(workflowRecord))).json();assert.equal(partialWorkflow.status,'partial');assert.equal(partialWorkflow.evidencePending,true);assert.equal(partialWorkflow.assets.length,1);assert.equal(partialWorkflow.assets[0].mediaType,'video');
 const partialList=await(await adminRoutes.GET(request('/api/admin/creations?status=partial',admin))).json();assert(partialList.items.some((r:any)=>r.id===workflowRecord));
 await pool.query("UPDATE app_video_workflow_run_nodes SET status='completed' WHERE run_id=$1",[workflowId]);
 assert.equal((await(await enterpriseDetail.GET(workflowRequest(),detailCtx(workflowRecord))).json()).status,'succeeded');
 const batchId=randomUUID(),batchRecord=`cr-${randomUUID()}`;
 await record(batchRecord,departed,a.tenantId);
 await pool.query("INSERT INTO app_imagegen_batches(id,owner,fingerprint,request,plan) VALUES($1,$2,'fixture','{}',$3::jsonb)",[batchId,departed,JSON.stringify({creationEvidencePending:true})]);
 await pool.query("INSERT INTO app_imagegen_batch_items(batch_id,key,ordinal,child_operation_id,request,plan,result) VALUES($1,'first',0,$2,'{}','{}',$3::jsonb)",[batchId,randomUUID(),JSON.stringify({artifacts:[{artworkId:pendingWork}]})]);
 await pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES($1,'imagegen-batch',$2,$3),($1,'imagegen-batch','legacy-non-uuid-source',$3)",[batchRecord,batchId,departed]);
 const batchOwnerResponse=await enterpriseDetail.GET(request(`/api/enterprise/creations/${batchRecord}?tenantId=${a.tenantId}`,ownerA),detailCtx(batchRecord));assert.equal(batchOwnerResponse.status,200);
 const batchEvidence=await batchOwnerResponse.json();assert.equal(batchEvidence.evidencePending,true);assert.equal(batchEvidence.assets.length,1);
 const batchAdminResponse=await adminDetail.GET(request(`/api/admin/creations/${batchRecord}`,admin),detailCtx(batchRecord));assert.equal(batchAdminResponse.status,200);assert.equal((await batchAdminResponse.json()).assets.length,1);
 await pool.query("UPDATE app_artworks SET video_url=image_url WHERE id=$1",[pendingWork]);
 const recoveryRepository=await import('../src/lib/saas/creations');
 for(const [parent,source] of [[batchRecord,batchEvidence.assets[0]],[workflowRecord,partialWorkflow.assets[0]]]){
  assert.equal(source.evidenceRecordId,parent);
  assert.deepEqual(await recoveryRepository.creationAsset({platform:true},parent,source.id,parent),await recoveryRepository.creationAsset({platform:true},parent,source.id));
 }
 const locatorRoot=`cr-${randomUUID()}`,locatorChild=`cr-${randomUUID()}`,locatorWork=`work-${randomUUID()}`,locatorJob=`job-${randomUUID()}`;
 const unauthorizedBranch=`cr-${randomUUID()}`,unauthorizedDescendant=`cr-${randomUUID()}`;
 await record(locatorRoot,departed,a.tenantId);await record(locatorChild,departed,a.tenantId,locatorRoot);
 await record(unauthorizedBranch,ownerB,b.tenantId,locatorRoot);await record(unauthorizedDescendant,departed,a.tenantId,unauthorizedBranch);
 await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient) VALUES($1,$2,'fixture','fixture','',$3,'')",[locatorWork,departed,historicInput]);
 await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered) VALUES($1,$2,'generate',$3,'{}',false)",[locatorJob,departed,{status:'done',creationEvidencePending:true,images:[{id:locatorWork}]}]);
 await pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES($1,'image:generate',$3,$4),($2,'image:generate',$3,$4)",[locatorChild,unauthorizedDescendant,locatorJob,departed]);
 const proofDetail=await (await enterpriseDetail.GET(request(`/api/enterprise/creations/${locatorRoot}?tenantId=${a.tenantId}`,ownerA),detailCtx(locatorRoot))).json();
 assert.equal(proofDetail.assets.length,1);const proof=proofDetail.assets[0];assert.equal(proof.evidenceRecordId,locatorChild);
 const recoveredRoute=(id:string,assetId:string,locator?:string,email=ownerA,extra='')=>mediaRoute.GET(request(`/api/enterprise/creations/${id}/assets/${assetId}?tenantId=${a.tenantId}${locator?`&evidenceRecord=${locator}`:''}${extra}`,email),{params:Promise.resolve({id,assetId})});
 const oldUrl=await recoveredRoute(locatorRoot,proof.id),shortUrl=await recoveredRoute(locatorRoot,proof.id,locatorChild);
 assert.equal(oldUrl.status,200);assert.equal(shortUrl.status,200);assert.deepEqual(await oldUrl.arrayBuffer(),await shortUrl.arrayBuffer());
 const deniedAsset=`recovered-${createHash('sha256').update(`${unauthorizedDescendant}:${locatorWork}`).digest('hex').slice(0,32)}`;
 assert.equal((await recoveredRoute(locatorRoot,deniedAsset,unauthorizedDescendant)).status,404);
 assert.equal((await recoveredRoute(locatorRoot,deniedAsset)).status,404);
 assert.equal((await recoveredRoute(locatorRoot,proof.id,locatorRoot)).status,404);
 assert.equal((await recoveredRoute(locatorRoot,proof.id,locatorChild,manager)).status,404);
 const videoProof=partialWorkflow.assets[0];const signed=await recoveredRoute(workflowRecord,videoProof.id,workflowRecord,ownerA,'&playback=1');
 assert.equal(signed.status,200);const playbackWithLocator=(await signed.json()).url;assert.equal(new URL(playbackWithLocator,'https://fixture.test').searchParams.get('evidenceRecord'),workflowRecord);
 const signedBytes=await mediaRoute.GET(request(playbackWithLocator,undefined,{range:'bytes=0-6'}),{params:Promise.resolve({id:workflowRecord,assetId:videoProof.id})});
 assert.equal(signedBytes.status,206);assert.equal(await signedBytes.text(),'fixture');
 if(process.env.NAUMI_VERIFY_CREATION_QUERY_STATS==='1'){
  const sharing=1600;
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,parent_id,status)
   SELECT 'cr-'||gen_random_uuid(),$1,'tenant',$2,'fixture','locator-bulk-'||n,$3,'succeeded' FROM generate_series(1,$4) n`,[departed,a.tenantId,locatorRoot,sharing]);
  await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered)
   SELECT source_id,actor_email,'generate',jsonb_build_object('creationEvidencePending',true,'images',jsonb_build_array(jsonb_build_object('id',source_id))),'{}',false
   FROM app_creation_records WHERE source_id LIKE 'locator-bulk-%';
   INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email)
   SELECT id,'image:generate',source_id,actor_email FROM app_creation_records WHERE source_id LIKE 'locator-bulk-%';
   ANALYZE app_creation_records; ANALYZE app_image_jobs; ANALYZE app_creation_links`);
  const measure=async(locator?:string)=>{
   await pool.query('SELECT pg_stat_statements_reset()');
   for(let i=0;i<8;i++){const read=await recoveryRepository.creationAsset({platform:true},locatorRoot,proof.id,locator);assert.equal(read.url,historicInput);}
   const {rows:[stats]}=await pool.query("SELECT COALESCE(sum(shared_blks_hit+shared_blks_read),0)::int AS blocks,COALESCE(sum(calls),0)::int AS queries FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND query ~* '^(select|with)\\s' AND query NOT LIKE '%pg_stat_statements%'");
   return stats;
  };
  const full=await measure(),single=await measure(locatorChild);assert.ok(single.blocks<full.blocks/5,JSON.stringify({full,single}));
  console.log('CREATION_RECOVERED_PREVIEW_STATS',JSON.stringify({familyRecords:sharing+2,reads:8,full,single}));
 }
 // Bounded overview preview must look beyond the first unfiltered page and
 // retain live source state, scope, ordering and recorded billing.
 await pool.query("UPDATE app_enterprise_members SET membership_status='active' WHERE email=$1",[member]);
 const recentFixture=async(email:string,tenant:string,status:string,minute:number)=>{
  const id=`cr-${randomUUID()}`;await record(id,email,tenant,null,status);
  await pool.query("UPDATE app_creation_records SET accepted_at='2002-01-09T00:00Z'::timestamptz+$2::int*interval '1 minute' WHERE id=$1",[id,minute]);
  return id;
 };
 const wanted=await Promise.all(['queued','running','cancel_requested','queued','running','queued'].map((status,i)=>recentFixture(member,a.tenantId,status,i+1)));
 const olderUnrelated=await recentFixture(member,a.tenantId,'failed',0);
 const ownerOnly=await recentFixture(ownerA,a.tenantId,'running',29);
 const foreignQueued=await recentFixture(ownerB,b.tenantId,'running',30);
 for(let i=0;i<7;i++)await recentFixture(member,a.tenantId,'succeeded',20+i);
 const linked=`overview-live-${randomUUID()}`;
 await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered) VALUES($1,$2,'generate','{\"status\":\"processing\"}','{}',false)",[linked,member]);
 await pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES($1,'image:generate',$2,$3),($1,'billing',$4,$3)",[wanted[5],linked,member,operation]);
 const window=`/api/enterprise/creations?tenantId=${a.tenantId}&from=2002-01-09&to=2002-01-09&size=5`,pending=`${window}&projection=recent&statusGroup=pending`;
 const response=await enterpriseRoutes.GET(request(pending,manager));assert.equal(response.status,200);
 const recent=await response.json();assert.deepEqual(Object.keys(recent),['items']);
 assert.deepEqual(recent.items.map((r:any)=>r.id),wanted.slice(1).reverse());
 assert.deepEqual(recent.items.map((r:any)=>r.status),['running','running','queued','cancel_requested','running']);
 assert.equal(recent.items[0].settledCredits,0);
 const unrestricted=await(await enterpriseRoutes.GET(request(pending,ownerA))).json();
 assert.equal(unrestricted.items[0].id,ownerOnly);assert(!unrestricted.items.some((r:any)=>r.id===foreignQueued));
 const rejected=await(await enterpriseRoutes.GET(request(`${window}&projection=recent&status=failed`,manager))).json();
 assert.deepEqual(rejected.items.map((r:any)=>r.id),[olderUnrelated]);
 assert.equal((await(await enterpriseRoutes.GET(request(window,manager))).json()).summary.pending,6);
 for(const invalid of [pending+'&status=failed',pending+'&page=2',pending+'&size=6',pending+'&view=unified',window+'&statusGroup=pending']){
  assert.equal((await enterpriseRoutes.GET(request(invalid,manager))).status,400);
 }
 assert.equal((await enterpriseRoutes.GET(request(pending,member))).status,403);
 assert.equal((await adminRoutes.GET(request(pending.replace('/enterprise/','/admin/'),admin))).status,400);
 console.log('RECENT_CREATION_PASS bounded=5 grouped_order=1 live_status=1 scoped_billing=1 cancelled_requests_counted=1 foreign_denied=1');

 // An existing writer lock on a selected tenant's sponsoring account must
 // never stall the picker; tenancy grants and action scopes still apply.
 const {enterpriseList}=await import('../src/lib/enterprise/server');
 const writer=await pool.connect();
 try {
  await writer.query('BEGIN');await writer.query('SELECT email FROM app_users WHERE email=$1 FOR UPDATE',[ownerA]);
  // Bound the test independently of the application timeout so a regression in
  // the old unbounded, share-locked query fails instead of hanging the suite.
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{
   const identities=await Promise.race([enterpriseList({email:manager,admin:false}),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('Enterprise picker waited for the writer lock')),2500);})]);
   assert.deepEqual(identities.map(t=>[t.id,t.owner,t.authorized_until]),[[a.tenantId,false,null]]);
  }finally{clearTimeout(timeout);}
 } finally {await writer.query('ROLLBACK');writer.release();}
 assert.equal((await enterpriseList({email:member,admin:false})).length,0);
 assert.deepEqual((await enterpriseList({email:member,admin:false},true)).map(t=>t.id),[a.tenantId]);
 assert.deepEqual(new Set((await enterpriseList(actor)).map(t=>t.id)),new Set([a.tenantId,b.tenantId]));
 await pool.query('UPDATE app_team_access_grants SET enabled=false WHERE email=$1',[ownerA]);
 assert.equal((await enterpriseList({email:manager,admin:false})).length,0);
 await pool.query('UPDATE app_team_access_grants SET enabled=true WHERE email=$1',[ownerA]);
 await pool.query("UPDATE app_tenant_entitlements SET feature_policy=feature_policy||'{\"team\":false}'::jsonb WHERE tenant_id=$1",[a.tenantId]);
 assert.equal((await enterpriseList({email:manager,admin:false})).length,0);
 console.log('ENTERPRISE_PICKER_PASS writer_lock_nonblocking=1 management_scope=1 workflow_self=1 sponsorship=1 entitlement=1');
 const previous=process.env.FLEET_PORTAL_ONLY;process.env.FLEET_PORTAL_ONLY='1';assert.equal((await adminRoutes.GET(request('/api/admin/creations',admin))).status,403);process.env.FLEET_PORTAL_ONLY=previous;
 console.log('SAAS_CREATION_READER_PASS real_pg=1 real_imagegen_uuid_schema=1 uuid_batch_recovery=1 heterogeneous_link_ids=1 real_auth=1 cross_tenant=1 media_parent_scope=1 revoked_media=1 archived_owner=1 current_subordinates=1 private_cache=1 safe_projection=1 explicit_false_zero=1 exact_billing_dedup=1 unknown_null=1 child_assets=1 bounded_pages=1 video_range=1 ssrf_reject=1 fleet_restriction=1 supplier_calls=0');
 await pool.end();
}
main().catch(e=>{console.error(e);process.exitCode=1;setTimeout(()=>process.exit(1),100).unref();});
