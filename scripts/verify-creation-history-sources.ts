import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';

const baseline=process.argv.includes('--baseline');
async function main(){
 Object.assign(process.env,{PGPOOL_MAX:'5',NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'fixture-legacy-sources-0123456789abcdef'});
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 const guard=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000});
 let connected=false,locked=false;
 try{
  const db=await import('../src/lib/db'),tenant=await import('../src/lib/saas/tenants'),{GET}=await import('../src/app/api/admin/creations/route');
  const {ensureCreationSchema}=await import('../src/lib/saas/creation-schema'),{signUserSession}=await import('../src/lib/native-auth');
  const {legacyCreationId}=await import('../src/lib/saas/creation-history-identity');
  await tenant.ensureTenantSchema();await ensureCreationSchema();
  const admin='history-admin@fixture.test',owner='history-owner@fixture.test',other='history-other@fixture.test';
  for(const actor of [admin,owner,other])await db.getOrCreateUser(actor,actor);
  await db.setUserRole(admin,'admin');
  const create=(email:string,name:string)=>tenant.createTenant({email:admin,admin:true},
   {commandId:randomUUID(),name,ownerEmail:email,validUntil:null,seatLimit:null,entitlementName:null,featurePolicy:{}});
  const a=(await create(owner,'Fixture A')).tenantId,b=(await create(other,'Fixture B')).tenantId;
  const legacy=(table:'app_image_jobs'|'app_canvas_image_tasks'|'app_video_tasks',id:string,email=owner)=>legacyCreationId({table,id,email});
  await f.pool.query(`INSERT INTO app_video_tasks(id,email,upstream_id,parameters,status,created_at)
   VALUES ('video-arch',$1,'up1','{"prompt":"既有视频"}','succeeded','2026-11-01T00:00Z'),
    ('video-live',$1,'up2','{"prompt":"历史视频要求"}','succeeded','2026-11-02T00:00Z'),
    ('video-unrecorded',$2,'up3','{}','succeeded','2026-11-03T00:00Z');
  `,[owner,other]);
  await f.pool.query(`INSERT INTO app_canvas_image_tasks(id,email,source_artwork_id,parameters,status,created_at)
   VALUES('canvas-live',$1,'fixture','{"newText":"历史画布要求"}','succeeded','2026-11-03T00:00Z')`,[owner]);
  await f.pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,created_at)
   VALUES('image-live',$1,'generate','{"status":"done"}','{"p":{"userPrompt":"历史图片要求"}}',false,'2026-11-04T00:00Z'),
    ('image-child',$1,'generate','{"status":"done"}','{}',false,'2026-11-05T00:00Z'),
    ('image-other',$2,'generate','{"status":"done"}','{"p":{"userPrompt":"另一个账户图片"}}',false,'2026-11-05T00:00Z'),
    ('image-parent',$1,'imagegen','{"status":"done","children":{"slot":{"jobId":"image-child"},"foreign":{"jobId":"image-other"}}}','{}',false,'2026-11-06T00:00Z')`,[owner,other]);
  await f.pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,status,accepted_at)
   VALUES('formal-video',$1,'tenant',$2,'video','canonical-video','succeeded','2026-11-01T00:00Z'),
    ('formal-other',$3,'tenant',$4,'video','canonical-other','succeeded','2026-11-02T00:00Z'),
    ('formal-text',$1,'tenant',$2,'agent-turn','canonical-text','succeeded','2026-11-03T00:00Z')`,[owner,a,other,b]);
  await f.pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES('formal-video','video','video-arch',$1)",[owner]);
  const read=(params:Record<string,string>,projection=true)=>GET(new Request('http://localhost/api/admin/creations?'+
   new URLSearchParams({view:'unified',period:'all',...(projection?{projection:'list'}:{}),...params}),
   {headers:{cookie:'nv_user='+signUserSession(admin,Date.now())}}));
  for(const projection of [true,false]){
   const rr=await read({source:'video',user:owner},projection),video=await rr.json();
   assert.equal(rr.status,200,JSON.stringify(video));
   assert.deepEqual(video.items.map((item:{id:string})=>item.id),[legacy('app_video_tasks','video-live'),'formal-video']);
   assert.equal(video.items[0].title,'历史视频要求');assert.equal(video.pagination.total,2);
   const unknownPrompt=await(await read({source:'video',user:other},projection)).json();
   assert.equal(unknownPrompt.items[0].id,legacy('app_video_tasks','video-unrecorded',other));assert.equal(unknownPrompt.items[0].completeness,'not_recorded');
   const exact=await(await read({source:'video',tenantId:a},projection)).json();assert.deepEqual(exact.items.map((item:{id:string})=>item.id),['formal-video']);
   const unknown=await(await read({source:'agent-turn'},projection)).json();assert.deepEqual(unknown.items.map((item:{id:string})=>item.id),['formal-text']);
   const canvas=await(await read({source:'canvas-image',q:'画布',status:'succeeded'},projection)).json();
   assert.equal(canvas.items[0].id,legacy('app_canvas_image_tasks','canvas-live'));assert.equal(canvas.items[0].title,'历史画布要求');
   const image=await(await read({source:'image:generate',size:'1',page:'2'},projection)).json();
   assert.equal(image.pagination.total,2);assert.equal(image.items[0].id,legacy('app_image_jobs','image-live'));assert.equal(image.items[0].title,'历史图片要求');
   const otherActor=await(await read({source:'image:generate',user:other},projection)).json();assert.equal(otherActor.items[0].id,legacy('app_image_jobs','image-other',other));
  }
  await guard.connect();connected=true;
  await guard.query('BEGIN; LOCK TABLE app_canvas_image_tasks IN ACCESS EXCLUSIVE MODE');locked=true;
  for(const projection of [true,false]){
   const res=await read({source:'video'},projection);assert.equal(res.status,baseline?503:200,await res.text());
   const canonical=await read({tenantId:a},projection);assert.equal(canonical.status,baseline?503:200,await canonical.text());
  }
  const actualCanvas=await read({source:'canvas-image'});assert.equal(actualCanvas.status,503);
  console.log(baseline?'CREATION_HISTORY_SOURCES_BASELINE=PASS UNRELATED_LOCK_BLOCKS=4':
   'CREATION_HISTORY_SOURCES=PASS UNRELATED_LOCK_BYPASSED=4 RELEVANT_LOCK_ENFORCED=1 EXACT_TOTAL=1 OWNER_AND_CHILD=1 LEGACY_AND_FULL=1');
 }finally{
  if(locked)await guard.query('ROLLBACK').catch(()=>{});
  if(connected)await guard.end();
  await f.close();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
