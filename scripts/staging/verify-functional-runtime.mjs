// Execute inside the fixed staging app. Credentials stay in memory; output is counts/IDs.
import assert from 'node:assert/strict';
import {createHmac,randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,rename} from 'node:fs/promises';
const require=createRequire('/app/server.js'), {Pool}=require('pg'), sharp=require('sharp');
assert.equal(process.env.NAUMI_ENVIRONMENT,'staging');
assert.equal(process.env.NAUMI_STAGING_HISTORY_GUARD,'1');
assert.equal(process.env.STORAGE_DRIVER,'local');
const db=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
const origin='http://127.0.0.1:3000', receiptPath='/tmp/naumi-staging-functional-20261009.json';
const sourceJob='job-234bb140-6937-45ae-ba2d-4e50711a27f3';
const mode=process.argv[2]||'--inventory';
assert.ok(['--inventory','--edit','--video','--poll','--verify'].includes(mode));
let receipt;
try{receipt=JSON.parse(await readFile(receiptPath,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;receipt={version:1,sourceJob}}
assert.equal(receipt.sourceJob,sourceJob);
async function save(){await writeFile(receiptPath+'.tmp',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});await rename(receiptPath+'.tmp',receiptPath)}
function check(r,label){assert.equal(r.status,200,`${label}: HTTP=${r.status} CODE=${r.body?.code||''}`)}
try{
 assert.equal((await db.query('SELECT current_database() db')).rows[0].db,'naumi_staging');
 const hash=(await db.query("SELECT v FROM app_settings WHERE k='admin_password_hash'")).rows[0]?.v;
 const user=(await db.query("SELECT email FROM app_users WHERE role='admin' AND NOT banned ORDER BY joined_at LIMIT 1")).rows[0];assert.ok(hash&&user?.email);
 const exp=Date.now()+3600000,eb=Buffer.from(user.email).toString('base64url');
 const mac=createHmac('sha256',process.env.SETTINGS_SECRET).update(`admin-access:${exp}:${hash}`).digest('hex');
 const umac=createHmac('sha256',process.env.SETTINGS_SECRET).update(`user:${eb}.${exp}`).digest('hex');
 const cookie=`nv_admin=${exp}.${mac}; nv_user=${eb}.${exp}.${umac}`;
 async function req(path,body,{method,headers={},timeout=45000,authenticated=true}={}){
  const multipart=body instanceof FormData;
  const r=await fetch(origin+path,{method:method||(body===undefined?'GET':'POST'),headers:{origin,...(authenticated?{cookie}:{}),...(multipart?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:multipart?body:JSON.stringify(body)}),signal:AbortSignal.timeout(timeout)});
  const data=await r.json();return {status:r.status,body:data};
 }
 async function localMedia(url,video=false){
  assert.ok(typeof url==='string'&&url.startsWith('/media/')&&!url.includes('..'),'result must be local media');
  const r=await fetch(origin+url,{headers:{cookie},signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);
  const bytes=Buffer.from(await r.arrayBuffer());assert.ok(bytes.length>0);
  const range=await fetch(origin+url,{headers:{cookie,Range:'bytes=0-127'},signal:AbortSignal.timeout(15000)});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,Math.min(128,bytes.length));
  if(video)assert.match(r.headers.get('content-type')||'',/^video\//);else{const meta=await sharp(bytes).metadata();assert.ok(meta.width>0&&meta.height>0)}
  return {bytes,hash:createHash('sha256').update(bytes).digest('hex')};
 }
 async function settled(id,ledgerId){
  const row=(await db.query('SELECT state,charged_credits,reserved_credits FROM app_billing_operations WHERE id=$1',[id])).rows[0];assert.equal(row?.state,'settled');assert.equal(Number(row.reserved_credits),0);
  const ledger=(await db.query('SELECT count(*)::int n,COALESCE(sum(delta),0)::int delta FROM app_ledger WHERE id=$1',[ledgerId])).rows[0];assert.equal(ledger.n,1);assert.equal(-ledger.delta,Number(row.charged_credits));
  return Number(row.charged_credits);
 }
 async function verifyEdit(){
  const e=receipt.edit;assert.ok(e?.operationId);
  const row=(await db.query('SELECT state,result_response FROM app_billing_operations WHERE id=$1',['tool-'+e.operationId])).rows[0];assert.equal(row?.state,'settled');assert.ok(row.result_response?.url);
  const media=await localMedia(row.result_response.url);
  const charged=await settled('tool-'+e.operationId,'led-tool-'+e.operationId);
  const art=(await db.query('SELECT id,parent_id,image_url,category FROM app_artworks WHERE id=$1',[row.result_response.id])).rows[0];assert.ok(art);assert.equal(art.parent_id,e.parentId);assert.equal(art.category,'inpaint');
  assert.equal((await db.query("SELECT count(*)::int n FROM naumi_staging_guard.origin_rows WHERE table_name='app_billing_operations' AND row_key=$1",['tool-'+e.operationId])).rows[0].n,0);
  receipt.edit={...e,state:'settled',artworkId:art.id,mediaUrl:row.result_response.url,charged,mediaSha256:media.hash};await save();
  console.log(`STAGING_REAL_EDIT=PASS OPERATION_ID=tool-${e.operationId} ARTWORK_ID=${art.id} CHARGED=${charged} RESERVED=0 LEDGER_ROWS=1 MEDIA=200 RANGE=206 LINEAGE=KEPT`);
 }
 async function verifyVideo(){
  const v=receipt.video;assert.ok(v?.taskId);
  const out=await req('/api/video/tasks/'+encodeURIComponent(v.taskId));check(out,'video read-only');const task=out.body.task;
  console.log(`STAGING_VIDEO_STATE TASK_ID=${v.taskId} STATUS=${task.status} PROGRESS=${task.progress}`);
  receipt.video={...v,state:task.status};await save();
  if(['failed','cancelled'].includes(task.status)){
   const row=(await db.query('SELECT credits_refunded FROM app_video_tasks WHERE id=$1',[v.taskId])).rows[0];assert.equal(row.credits_refunded,true);
   const bill=(await db.query('SELECT state,charged_credits,reserved_credits FROM app_billing_operations WHERE id=$1',[v.taskId])).rows[0];assert.equal(bill.state,'settled');assert.equal(Number(bill.charged_credits),0);assert.equal(Number(bill.reserved_credits),0);
   assert.equal((await db.query('SELECT count(*)::int n FROM app_gen_reservations WHERE job_id=$1',[v.taskId])).rows[0].n,0);
   assert.equal((await db.query('SELECT count(*)::int n FROM app_ledger WHERE id=$1',[`led-video-${v.taskId}`])).rows[0].n,0);
   const sql="SELECT (SELECT COALESCE(sum(remaining),0)::text FROM app_credit_batches WHERE email=$1) remaining,(SELECT credits_used::text FROM app_users WHERE email=$1) reserved,(SELECT count(*)::int FROM app_supplier_calls WHERE operation_id=$2) calls";
   const before=(await db.query(sql,[user.email,v.taskId])).rows[0];
   for(let i=0;i<2;i++){const again=await req('/api/video/tasks?id='+encodeURIComponent(v.taskId));check(again,'failed task repeat');assert.equal(again.body.task.status,task.status)}
   const after=(await db.query(sql,[user.email,v.taskId])).rows[0];assert.deepEqual(after,before);
   receipt.video.failureRefundVerified=true;receipt.video.charged=0;receipt.video.reserved=0;await save();
   console.log(`STAGING_VIDEO_FAILURE_REFUND=PASS TASK_ID=${v.taskId} CHARGED=0 RESERVED=0 LEDGER_ROWS=0 RESERVATIONS=0 REPEATED_POLLS=2 WALLET_UNCHANGED=1`);
   process.exitCode=0;return false;
  }
  if(task.status!=='completed'){throw new Error('video non-terminal: '+task.status);}
  const media=await localMedia(task.videoUrl,true);const charged=await settled(v.taskId,'led-video-'+v.taskId);
  const row=(await db.query('SELECT upstream_id,credits_refunded FROM app_video_tasks WHERE id=$1',[v.taskId])).rows[0];assert.ok(row.upstream_id);assert.equal(row.credits_refunded,false);
  const arts=(await db.query('SELECT count(*)::int n FROM app_artworks WHERE id=$1',['vid-art-'+v.taskId])).rows[0];assert.equal(arts.n,1);
  receipt.video={...receipt.video,state:'completed',charged,mediaUrl:task.videoUrl,mediaSha256:media.hash};await save();
  console.log(`STAGING_REAL_VIDEO=PASS TASK_ID=${v.taskId} MODEL=${v.modelId} CHARGED=${charged} RESERVED=0 LEDGER_ROWS=1 ARTWORK_ROWS=1 MEDIA=200 RANGE=206 BYTES=${media.bytes.length}`);return true;
 }
 if(mode==='--inventory'){
  const account=await req('/api/account');check(account,'account');assert.equal(account.body.persisted,true);
  const ids=(await db.query('SELECT id FROM app_artworks WHERE email=$1 AND deleted_at IS NULL ORDER BY created_at LIMIT 6',[user.email])).rows.map(r=>r.id);
  assert.ok(ids.length);const history=await req('/api/artworks/get?ids='+encodeURIComponent(ids.join(',')));check(history,'history');assert.equal(history.body.artworks.length,ids.length);
  let mediaCount=0,nonLocal=0;for(const art of history.body.artworks){if(art.image?.startsWith('/media/')){await localMedia(art.image);mediaCount++}else nonLocal++}
  console.log(`STAGING_HISTORY_READ=PASS ACCOUNT_ARTWORKS=${account.body.artworks.length} HISTORY_ROWS=${ids.length} LOCAL_MEDIA_CHECKED=${mediaCount} NON_LOCAL_REFERENCES=${nonLocal} PASSWORD_LOGIN_NOT_TESTED=1`);
  const projects=await req('/api/projects');check(projects,'projects');const tasks=await req('/api/video/tasks');check(tasks,'task list');
  for(const feature of ['tool.inpaint','video.generate']){const r=await req('/api/models?feature='+feature);check(r,'catalog');console.log('STAGING_MODEL_CATALOG='+JSON.stringify({feature,default:r.body.defaultModelId,models:r.body.models.map(m=>m.id)}))}
  const cat=await req('/api/video/catalog');check(cat,'video capabilities');console.log('STAGING_VIDEO_CAPABILITIES='+JSON.stringify({configured:cat.body.configured,model:cat.body.defaultModel,models:cat.body.models}));
  const unauth=await req('/api/video/tasks',undefined,{authenticated:false});assert.equal(unauth.status,401);console.log('STAGING_HISTORY_BOUNDARIES=PASS PROJECTS=200 VIDEO_LIST=200 VIDEO_UNAUTH=401');
 }
 if(mode==='--edit'){
  if(receipt.edit){await verifyEdit()}else{
   const source=await req('/api/generate-image?job='+sourceJob);check(source,'existing image');assert.equal(source.body.status,'done');const image=source.body.images[0];
   const downloaded=await localMedia(image.url);const parent=(await db.query('SELECT id FROM app_artworks WHERE image_url=$1 AND email=$2 ORDER BY created_at DESC LIMIT 1',[image.url,user.email])).rows[0];assert.ok(parent);
   const meta=await sharp(downloaded.bytes).metadata();const w=meta.width,h=meta.height;
   const clear=await sharp({create:{width:Math.max(1,Math.floor(w/3)),height:Math.max(1,Math.floor(h/3)),channels:4,background:{r:0,g:0,b:0,alpha:1}}}).png().toBuffer();
   const mask=await sharp({create:{width:w,height:h,channels:4,background:{r:255,g:255,b:255,alpha:1}}}).composite([{input:clear,left:Math.floor(w/3),top:Math.floor(h/3),blend:'dest-out'}]).png().toBuffer();
   const cat=await req('/api/models?feature=tool.inpaint');check(cat,'edit catalog');const model=cat.body.defaultModelId;
   const quote=await req('/api/billing/quote',{feature:'tool.inpaint',quantity:1,quality:'medium',resolution:'1K',ratio:'1:1',modelId:model});check(quote,'edit quote');
   const operationId='staging-edit-'+randomUUID();receipt.edit={operationId,parentId:parent.id,modelId:model,state:'submission_started'};await save();
   const f=new FormData();f.set('image',new Blob([downloaded.bytes],{type:'image/png'}),'source.png');f.set('mask',new Blob([mask],{type:'image/png'}),'mask.png');f.set('prompt','预发布局部改图验收：涂抹区域改成蓝色陶瓷材质，保持杯子的形状和其余背景不变。');f.set('parentId',parent.id);f.set('title','预发布局部改图验收');f.set('quality','medium');f.set('resolution','1K');f.set('ratio','1:1');f.set('model',model);
   console.log(`STAGING_REAL_EDIT_SUBMITTED OPERATION_ID=tool-${operationId} MODEL=${model}`);
   const r=await req('/api/inpaint',f,{headers:{'x-naumi-billing-operation-id':operationId,'x-naumi-billing-version':String(quote.body.version),'x-naumi-billing-credits':String(quote.body.authorization?quote.body.authorizedCredits:quote.body.credits)},timeout:320000});
   receipt.edit.httpStatus=r.status;receipt.edit.code=r.body.code||null;await save();check(r,'edit');await verifyEdit();
  }
 }
 if(mode==='--video'){
  if(receipt.video){console.log('STAGING_VIDEO_ALREADY_SUBMITTED=1 NO_NEW_REQUEST=1');await verifyVideo()}else{
   const cat=await req('/api/video/catalog');check(cat,'video catalog');assert.equal(cat.body.configured,true);const model=cat.body.models.find(m=>m.modelId===cat.body.defaultModel)||cat.body.models[0];assert.ok(model.modes.includes('text'));
   const duration=model.defaultDuration||model.durations[0],resolution=model.resolutions[0],modelId=model.modelId,providerId=model.providerId;
   const q=await req('/api/billing/quote',{feature:'video.generate',quantity:1,modelId,providerId,resolution});check(q,'video quote');
   const operationId='staging-video-'+randomUUID(),idempotencyKey=operationId;
   receipt.video={operationId,idempotencyKey,modelId,duration,resolution,state:'submission_started'};await save();
   const r=await req('/api/video/generate',{prompt:'预发布视频验收：一只红色陶瓷杯在白色摄影背景前缓慢旋转，稳定镜头，无文字，无水印。',modelId,providerId,durationSeconds:duration,resolution,source:'workbench',idempotencyKey,billingVersion:q.body.version,billingCredits:q.body.authorization?q.body.authorizedCredits:q.body.credits},{headers:{'x-naumi-billing-operation-id':operationId},timeout:150000});
   receipt.video.httpStatus=r.status;receipt.video.code=r.body.code||null;receipt.video.taskId=r.body.taskId;await save();check(r,'video submit');assert.ok(receipt.video.taskId);
   console.log(`STAGING_REAL_VIDEO_SUBMITTED TASK_ID=${receipt.video.taskId} MODEL=${modelId} DURATION=${duration} NO_RESUBMIT=1`);await verifyVideo();
  }
 }
 if(mode==='--poll'){assert.ok(receipt.video?.taskId,'read receipt; never create while polling');await verifyVideo()}
 if(mode==='--verify'){if(receipt.edit)await verifyEdit();if(receipt.video)await verifyVideo()}
 if(['--video','--poll'].includes(mode)&&receipt.video?.state!=='completed')process.exitCode=2;
}finally{await db.end()}
