// Extend the real existing Agent handler/PG lifecycle fixture, without duplicating its runtime.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=process.cwd(),out=path.resolve('output/agent-chat-attachments-20261020');fs.mkdirSync(out,{recursive:true});
let source=fs.readFileSync('scripts/verify-canvas-agent-execution.ts','utf8');
source=source.replace('f=await createModelFixture','console.log("PG_STAGE=START");f=await createModelFixture').replace('db=await import','console.log("PG_STAGE=MODEL_FIXTURE_READY");db=await import').replace('await db.ensureSchema();','await db.ensureSchema();console.log("PG_STAGE=SCHEMA_READY");').replace('const id=randomUUID(),response=','console.log("PG_STAGE=HANDLER_START");const id=randomUUID(),response=').replace('const output=','console.log("PG_STAGE=HANDLER_DONE");const output=');
source=source.replace('const calls:any[]=[]','let expectTwo=false; const calls:any[]=[]');
const needle='modelCalls++;calls.push(body);';assert.ok(source.includes(needle));source=source.replace(needle,needle+`if(expectTwo){const latest=body.messages.filter((m:any)=>m.role==='user').at(-1);assert.equal(latest.content.filter((p:any)=>p.type==='image_url').length,2,'latest model message must contain both actual images');}`);
const before='const id=randomUUID(),response=';const at=source.indexOf(before);assert.ok(at>0);
source=source.slice(0,at)+`analysis=true;
  const large=await (await import('sharp')).default((await import('node:crypto')).randomBytes(2304*2048*3),{raw:{width:2304,height:2048,channels:3}}).png({compressionLevel:0}).toBuffer();assert.ok(large.length>12*1024*1024);
  const sharp=(await import('sharp')).default,thumbnail=await sharp(large).resize(512,512,{fit:'inside'}).webp().toBuffer(),preview=await sharp(large).resize(1600,1600,{fit:'inside'}).webp().toBuffer();
  const stored=await (await import('../../src/lib/canvas-original-upload')).saveCanvasOriginal(large,'second-photo.png',email,{thumbnail,preview});
  const ref=await(await import('../../src/lib/agent/canvas-reference-preview')).readCanvasVisionReference(stored.url);assert.ok(ref&&ref.bytes.length<4*1024*1024);assert.deepEqual(ref.bytes,preview);
  await db.addArtworks(email,[{id:'second-photo',title:'第二张产品图',category:'main',prompt:'',status:'completed',image:stored.url,gradient:'',parentId:'anchor',source:'canvas-add',origin:'canvas',groupId:'fixture-project'}],'second-photo-fixture');
  const lifecycle=await import('../../src/app/api/canvas/assistant/route');
  const historyRequest=(id:string)=>new Request(f.origin+'/api/canvas/assistant?anchorId=anchor&id='+id,{headers:{cookie}});
  expectTwo=true;
  const multiPayload={...task,sessionId:randomUUID(),turnId:randomUUID(),contextIds:['anchor','second-photo'],messages:[{role:'user',content:'只分析这两张图，不要生成'}]};
  const multiResponse=await handler(request(multiPayload,randomUUID()));assert.equal(multiResponse.status,200);const multiEvents=await multiResponse.text();assert.match(multiEvents,/event: done/);
  const multiId=JSON.parse(multiEvents.match(/event: open\\ndata: ([^\\n]+)/)![1]).sessionId;
  const multiHistory=await(await lifecycle.GET(historyRequest(multiId))).json();assert.deepEqual(multiHistory.session.referenceIds,['anchor','second-photo']);
  const {removeRuntimeSession}=await import('../../src/lib/agent/runtime');assert.equal(removeRuntimeSession(email,multiId),'removed');const multiCold=await(await lifecycle.GET(historyRequest(multiId))).json();assert.deepEqual(multiCold.session.referenceIds,['anchor','second-photo']);
  const foreignResponse=await handler(request({...multiPayload,sessionId:randomUUID(),turnId:randomUUID(),contextIds:['anchor','foreign-unowned']},randomUUID()));assert.equal(foreignResponse.status,404);assert.equal(childWrites,0);
  const resumed=await handler(request({...multiPayload,sessionId:multiId,turnId:randomUUID()},randomUUID()));assert.equal(resumed.status,200);assert.match(await resumed.text(),/event: done/);assert.equal(childWrites,0);
  console.log('ATTACHMENTS_REAL_HANDLER=PASS MODEL_IMAGES=2 HISTORY_RESTART=2 OWNER_DENIED=404 ORIGINAL_OVER12MIB=PREVIEW_READ EXTRA_IMAGE_WRITES=0 PAID_UPSTREAM_CALLS=0');
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});`;
source=source.replaceAll('"./model-config-fixture"','"../../scripts/model-config-fixture"').replaceAll('"../src/', '"../../src/');
const target=path.join(out,'pg-runner.ts');fs.writeFileSync(target,source);
const result=cp.spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','--conditions','react-server',target],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});process.exitCode=result.status??1;
