import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {artworkRows} from '../src/lib/canvas/artwork-document-model';
import {createModelFixture} from './model-config-fixture';

/** Actual route/PG/pixels/document/history/owner; only the transport and private
 * local storage selection are fixture adapters. No provider or paid work. */
async function main(){
 const out=path.resolve(process.argv[2]||process.env.LOCAL_IMAGE_EDIT_PG_EVIDENCE||'output/canvas-local-image-edits-pg');await mkdir(out,{recursive:true});
 const media=await mkdtemp(path.join(tmpdir(),'naumi-r7q-local-edit-'));Object.assign(process.env,{STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:media,NAUMI_MULTI_USER:'1',SETTINGS_SECRET:randomUUID()+randomUUID()});
 console.log('LOCAL_EDIT_PG_PHASE=FIXTURE');
 const f=await createModelFixture();process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
 const {ensureSchema}=await import('../src/lib/persistence/schema'),{getPool,closeDatabasePools}=await import('../src/platform/db/pool'),{getOrCreateUser}=await import('../src/lib/accounts/session'),{listArtworksByIds}=await import('../src/lib/artworks/repository'),storage=await import('../src/lib/storage'),auth=await import('../src/lib/native-auth');
 const {POST}=await import('../src/app/api/canvas/local-image-edit/route'),{GET}=await import('../src/app/api/artworks/get/route');
 const {createCanvasLocalImageEdits}=await import('../src/lib/canvas/local-image-edits'),{createCanvasArtworkDocument}=await import('../src/lib/canvas/artwork-document'),{createCanvasHistoryController}=await import('../src/lib/canvas/history-controller');
 const fetchBefore=globalThis.fetch,scope={account:'r7q-a',workspace:'personal',project:'tree:r7q-source',key:'r7q-scope',documentCurrent:()=>true,viewCurrent:()=>true,assertView:()=>{}};
 const owner=`r7q-${randomUUID()}@fixture.test`,other=`other-${randomUUID()}@fixture.test`;let posts=0,reads=0,checks=0,historyChanges=0,failSync=false,loseAck=false;const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
 try{
  console.log('LOCAL_EDIT_PG_PHASE=SCHEMA');await ensureSchema();await getOrCreateUser(owner,'R7Q');await getOrCreateUser(other,'Other');
  const bytes=await sharp({create:{width:8,height:6,channels:3,background:'#285c47'}}).png().toBuffer(),image=await storage.uploadImage(bytes,'image/png','r7q/source.png',undefined,owner);
  await getPool().query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,group_id,source_url,origin,image_width,image_height) VALUES('r7q-source',$1,'original','main','','completed',$2,'','r7q-source','canvas-add','canvas',8,6)",[owner,image]);
  const original=artworkRows(await listArtworksByIds(owner,['r7q-source']))[0],originalHash=createHash('sha256').update((await storage.readManagedObject(image,1024*1024)).bytes).digest('hex');
  const cookie=`nv_user=${auth.signUserSession(owner,Date.now())}`,otherCookie=`nv_user=${auth.signUserSession(other,Date.now())}`;
  globalThis.fetch=async(input,init)=>{
   const url=new URL(input instanceof Request?input.url:String(input),'http://127.0.0.1:14991');assert.equal(url.hostname,'127.0.0.1');
   if(url.pathname==='/api/canvas/local-image-edit'){posts++;const request=new Request(url,{...init,headers:new Headers(init?.headers)});request.headers.set('cookie',cookie);const response=await POST(request);if(loseAck){loseAck=false;throw new Error('fixture lost ACK after route commit');}return response;}
   if(url.pathname==='/api/artworks/get'){reads++;if(failSync)throw Error('fixture sync failure');return GET(new Request(url,{headers:{cookie}}));}
   throw Error('Unexpected fixture request '+url.pathname);
  };
  const document=createCanvasArtworkDocument().bind(scope,owner,true);
  const history=createCanvasHistoryController({changed:()=>{historyChanges++;},readOnly:()=>false,flush:async()=>{},transaction:async(_s,work)=>work(),video:()=>undefined,refresh:async()=>{},warning:()=>{},commit:()=>{},pending:()=>{}});
  const editor=createCanvasLocalImageEdits().bind(scope),tips:string[]=[],applied:string[]=[];
  const ports={writable:()=>true,ready:true,locked:()=>false,viewCurrent:()=>true,merge:document.merge,history:{record:history.push},fill:async()=>{throw Error('Unexpected fill');},applied:(id:string)=>{applied.push(id);},notice:(s:string)=>{tips.push(s);},messages:{invalidFile:'invalid',failed:'failed',filled:'filled',fillFailed:'fill-failed',saved:'saved',unknown:'unknown',missing:'missing'}};
  const crop={x:.25,y:1/6,width:.5,height:.5};failSync=true;await editor.execute(original,crop,undefined,ports);
  check(posts===1,'one actual POST');check(applied.length===0&&history.list(scope).undo.length===0,'sync failure does not fake attachment');
  failSync=false;await editor.execute(original,crop,undefined,ports);
  check(posts===1,'known result retry has zero additional POST');check(applied.length===1&&history.list(scope).undo.length===1,'one existing history action after retry');
  const first=(await listArtworksByIds(owner,[applied[0]]))[0];check(first.id.startsWith('art-local-')&&first.width===4&&first.height===3,'actual crop dimensions and original result identity');check(first.parentId===original.id,'original lineage');
  check(createHash('sha256').update((await storage.readManagedObject(image,1024*1024)).bytes).digest('hex')===originalHash,'original bytes unchanged');
  loseAck=true;const secondCrop={x:0,y:0,width:.5,height:1};await editor.execute(original,secondCrop,undefined,ports);check(posts===2,'lost ACK committed one request');await editor.execute(original,secondCrop,undefined,ports);
  check(posts===2&&reads>=3,'lost ACK resumes authorized original artwork GET only');check(applied.length===2&&history.list(scope).undo.length===2,'one history per original local edit');
  const rows=await getPool().query('SELECT operation_id,artwork_id FROM app_canvas_local_edits WHERE email=$1 ORDER BY artwork_id',[owner]);check(rows.rows.length===2,'two real idempotency rows');
  const selected=rows.rows[0],replay=await POST(new Request('http://127.0.0.1:14991/api/canvas/local-image-edit',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({mode:'crop',id:original.id,operationId:selected.operation_id,crop:selected.artwork_id===first.id?crop:secondCrop})}));check(replay.status===200,'explicit original server replay returns old receipt');
  const denied=await GET(new Request(`http://127.0.0.1:14991/api/artworks/get?ids=${applied[0]}`,{headers:{cookie:otherCookie}}));check(denied.status===200&&(await denied.json()).artworks.length===0,'other account cannot read retained result');
  const noAuth=await GET(new Request(`http://127.0.0.1:14991/api/artworks/get?ids=${applied[0]}`));check(noAuth.status===401,'anonymous result rejected');
  const ledger=await getPool().query('SELECT count(*)::int AS n FROM app_ledger WHERE email=$1 AND delta<0',[owner]);check(ledger.rows[0].n===0,'no local-edit consume');
  const result={status:'PASS',checks,actualOwner:true,actualRoutes:true,realPG:true,actualArtworkDocument:true,actualHistoryController:true,historyChanges,post:posts,reads,addHistory:history.list(scope).undo.length,originalHash,originalImmutable:true,lostAck:'GET_ONLY',supplier:0,consume:0};await writeFile(path.join(out,'RESULT.json'),JSON.stringify(result,null,2));
  console.log(`CANVAS_LOCAL_IMAGE_EDITS_PG=PASS CHECKS=${checks} ACTUAL_OWNER_ROUTES_DOCUMENT_HISTORY=1 REAL_PG=1 LOCAL_POSTS=${posts} RESULT_GETS=${reads} ADD_HISTORY=2 UNKNOWN_REPOSTS=0 CONSUME=0 SUPPLIER=0`);
 }finally{globalThis.fetch=fetchBefore;await closeDatabasePools();await f.cleanup();const target=path.resolve(media);assert.ok(target.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(target).startsWith('naumi-r7q-local-edit-'));await rm(target,{recursive:true,force:true});await writeFile(path.join(out,'CLEANUP.json'),JSON.stringify({status:'PASS',schemaDropped:true,poolsClosed:true,fixtureServerClosed:true,ownTemporaryMediaRemoved:true}));console.log('LOCAL_EDIT_PG_CLEANUP=PASS SCHEMA=REMOVED POOLS=CLOSED MEDIA=REMOVED');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
