/** Actual original/current route, Web persistence, PG and Sharp bytes.
 * Baseline characterizes the captured original tree; no model/provider calls. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,rm,writeFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Pool} from 'pg';
import sharp from 'sharp';

const option=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
async function main(){
 const root=path.resolve(option('--source-root')||'.'),out=path.resolve(option('--out')||process.env.CANVAS_STITCH_PG_EVIDENCE||'output/canvas-stitch-pg'),baseline=process.argv.includes('--baseline');
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const target=new URL(process.env.DATABASE_URL!);assert.equal(target.hostname,'127.0.0.1');assert.match(target.pathname,/fixture/);
 await mkdir(out,{recursive:true});const media=path.join(out,'media'),schema='stitch_'+randomUUID().replaceAll('-','');await mkdir(media);
 Object.assign(process.env,{PGOPTIONS:'-c search_path='+schema,STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:media,NAUMI_MULTI_USER:'1',NAUMI_VIDEO_WORKER:'0',NAUMI_ROUTER_MANAGEMENT_URL:'',SETTINGS_SECRET:'stitch-pg-isolated-012345678901234567890'});
 const load=(p:string):Promise<any>=>import(pathToFileURL(path.join(root,p)).href),admin=new Pool({connectionString:process.env.DATABASE_URL,max:1,options:'-c search_path='+schema});let platform:any;
 let checks=0,posts=0;const observations:Record<string,unknown>={},sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 const eq=(a:unknown,b:unknown,label='')=>{assert.deepEqual(a,b,label);checks++;};
 try{
  await admin.query('CREATE SCHEMA '+schema);platform=await load('src/platform/db/pool.ts');
  await(await load('src/lib/application/startup.ts')).initializeWebApplication();
  const accounts=await load('src/lib/accounts/session.ts'),storage=await load('src/lib/media-upload.ts'),read=await load('src/lib/object-storage/managed-read.ts'),native=await load('src/lib/native-auth.ts');
  const email='stitch-owner@fixture.test',other='stitch-other@fixture.test';await accounts.getOrCreateUser(email);await accounts.getOrCreateUser(other);
  const bytes=[await sharp({create:{width:8,height:6,channels:3,background:'#ff0000'}}).png().toBuffer(),await sharp({create:{width:8,height:4,channels:4,background:{r:0,g:255,b:0,alpha:.5}}}).png().toBuffer()];
  const urls=await Promise.all(bytes.map((b,index)=>storage.uploadImage(b,'image/png','stitch-source-'+index+'.png',undefined,email)));
  for(let i=0;i<2;i++)await admin.query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,group_id,source_url,origin,image_width,image_height) VALUES($1,$2,$3,'main','','completed',$4,'','source-a','canvas-add','canvas',8,$5)",[i?'source-b':'source-a',email,'source'+i,urls[i],i?4:6]);
  const bundle=path.join(out,'actual-route.cjs');await build({entryPoints:[path.join(root,'src/app/api/canvas/stitch/route.ts')],outfile:bundle,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent'});
  const route=createRequire(import.meta.url)(bundle),cookie=(actor:string)=>'nv_user='+native.signUserSession(actor,Date.now());
  const body=(operationId=randomUUID())=>({ids:['source-a','source-b'],title:'Long image',x:-15,y:28,operationId});
  const post=async(input:unknown,actor=email)=>{posts++;return route.POST(new Request('http://localhost/api/canvas/stitch',{method:'POST',headers:{cookie:cookie(actor),origin:'http://localhost','content-type':'application/json','x-naumi-workspace':'personal','x-naumi-project-context':'tree:source-a'},body:JSON.stringify(input)}));};
  const get=async(operationId:string,actor=email)=>route.GET(new Request('http://localhost/api/canvas/stitch?operationId='+operationId,{headers:{cookie:cookie(actor),'x-naumi-workspace':'personal','x-naumi-project-context':'tree:source-a'}}));
  const rows=async()=>Number((await admin.query("SELECT count(*)::int n FROM app_artworks WHERE id LIKE 'canvas-long-%'")).rows[0].n);
  const receiptCount=async()=>Number((await admin.query("SELECT count(*)::int n FROM app_canvas_node_copies WHERE result->>'kind'='canvas-stitch'")).rows[0].n);

  let response=await post(body());eq(response.status,200);let result=await response.json();
  eq([result.width,result.height],[8,10]);const output=await read.readManagedObject(result.image,1024*1024),meta=await sharp(output.bytes).metadata();eq([meta.width,meta.height],[8,10]);
  const pixels=await sharp(output.bytes).removeAlpha().raw().toBuffer();eq([...pixels.subarray(0,3)],[255,0,0]);eq([...pixels.subarray(8*6*3,8*6*3+3)],[127,255,127]);
  const stored=(await admin.query('SELECT * FROM app_artworks WHERE email=$1 AND id=$2',[email,result.id])).rows[0];
  eq([stored.canvas_x,stored.canvas_y],[-15,28]);eq([stored.parent_id,stored.parent_ids,stored.group_id],['source-a',['source-b'],'source-a']);
  eq([stored.image_width,stored.image_height],baseline?[null,null]:[8,10]);
  observations.normal={pngSha256:sha(output.bytes),width:result.width,height:result.height,position:[stored.canvas_x,stored.canvas_y],parents:[stored.parent_id,stored.parent_ids],originalInputs:bytes.map(sha)};
  console.log('PASS actual PNG ordering/alpha flattening, original parent lineage and placement');

  const replay=body(),before=await rows(),first=await(await post(replay)).json(),again=await(await post(replay)).json();
  eq(await rows()-before,baseline?2:1);eq(first.id===again.id,!baseline);observations.repeatCreated=await rows()-before;
  if(!baseline){
   const beforePost=posts,receipt=await get(replay.operationId);eq(receipt.status,200);eq((await receipt.json()).result.id,first.id);eq(posts,beforePost);
   const conflict=await post({...replay,title:'Changed intent'});eq(conflict.status,409);eq(await rows()-before,1);
   await admin.query('UPDATE app_artworks SET deleted_at=now() WHERE id=$1',[first.id]);eq((await get(replay.operationId)).status,409);eq((await post(replay)).status,409);
   eq((await admin.query('SELECT deleted_at IS NOT NULL AS removed FROM app_artworks WHERE id=$1',[first.id])).rows[0].removed,true);
  }else eq(typeof route.GET,'undefined');
  console.log('PASS original operation replay/receipt or original repeated creation characterized');

  const atomicBefore=await rows(),receiptsBefore=await receiptCount();
  await admin.query(`CREATE FUNCTION ${schema}.reject_stitch_position() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id LIKE 'canvas-long-%' THEN RAISE EXCEPTION 'R8C_POSITION_FAULT'; END IF; RETURN NEW; END $$`);
  await admin.query(`CREATE TRIGGER reject_stitch_position BEFORE UPDATE OF canvas_x ON app_artworks FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_stitch_position()`);
  response=await post(body());eq(response.status,500);eq(await rows()-atomicBefore,baseline?1:0);eq(await receiptCount(),receiptsBefore);
  await admin.query('DROP TRIGGER reject_stitch_position ON app_artworks');observations.positionFailureCreated=await rows()-atomicBefore;
  console.log('PASS actual PG position-write fault measures whole publication atomicity');

  const simultaneous=body(),parallelBefore=await rows(),parallel=await Promise.all([post(simultaneous),post(simultaneous)]);eq(parallel.map(r=>r.status),[200,200]);
  const both=await Promise.all(parallel.map(r=>r.json()));eq(both[0].id===both[1].id,!baseline);eq(await rows()-parallelBefore,baseline?2:1);observations.concurrentCreated=await rows()-parallelBefore;
  if(!baseline){eq((await read.readManagedObject(both[0].image,1024*1024)).bytes.equals(output.bytes),true);}
  console.log('PASS real concurrent same-operation publication');

  const SourceClient=(await import('pg')).Client,originalSourceQuery=SourceClient.prototype.query;
  const changedBefore=await rows();let sourceChanged=false;
  SourceClient.prototype.query=function(this:any,...args:any[]){
   const sql=typeof args[0]==='string'?args[0]:args[0]?.text;
   if(!sourceChanged&&(baseline?sql?.includes('INSERT INTO app_artworks'):sql?.startsWith('SELECT id,image_url,group_id,batch_id FROM app_artworks'))){
    sourceChanged=true;return admin.query("UPDATE app_artworks SET deleted_at=now() WHERE id='source-b'").then(()=>Reflect.apply(originalSourceQuery,this,args));
   }
   return Reflect.apply(originalSourceQuery,this,args);
  }as typeof originalSourceQuery;
  try{eq((await post(body())).status,baseline?200:409);}finally{SourceClient.prototype.query=originalSourceQuery;await admin.query("UPDATE app_artworks SET deleted_at=NULL WHERE id='source-b'");}
  eq(sourceChanged,true);eq(await rows()-changedBefore,baseline?1:0);observations.sourceDeletedAfterPixelsCreated=await rows()-changedBefore;
  console.log('PASS real source deletion between pixel preparation and publication is revalidated');

  if(!baseline){
   const pool:Pool=platform.getPool(),nativeQuery=(await import('pg')).Client.prototype.query;
   let armed=true,committed=false;
   (await import('pg')).Client.prototype.query=function(this:any,...args:any[]){
    const sql=typeof args[0]==='string'?args[0]:args[0]?.text;
    if(sql?.startsWith('INSERT INTO app_canvas_node_copies'))armed=false;
    if(sql==='COMMIT'&&!armed&&!committed){committed=true;return (Reflect.apply(nativeQuery,this,args)as Promise<unknown>).then(()=>{throw Error('R8C_COMMIT_ACK_LOST');});}
    return Reflect.apply(nativeQuery,this,args);
   }as typeof nativeQuery;
   const uncertain=body(),uncertainBefore=await rows();
   try{eq((await post(uncertain)).status,500);}finally{(await import('pg')).Client.prototype.query=nativeQuery;}
   eq(committed,true);eq(await rows()-uncertainBefore,1);
   const recovered=await(await get(uncertain.operationId)).json();eq(!!recovered.result?.id,true);
   eq((await read.readManagedObject(recovered.result.image,1024*1024)).bytes.equals(output.bytes),true);
   eq((await(await post(uncertain)).json()).id,recovered.result.id);eq(await rows()-uncertainBefore,1);
   const allFiles=await readdir(media,{recursive:true});
   const stitchFiles=allFiles.filter(name=>String(name).startsWith('canvas-stitches'+path.sep)&&String(name).endsWith('.png'));
   eq(stitchFiles.length,await rows(),'Only committed winner files remain;losers and rolled-back preparations were deleted');
   eq(pool.waitingCount,0);console.log('PASS actual PG lost COMMIT ACK preserves winner bytes and original receipt,loser/rollback uploads removed');
  }

  const deniedBefore=await rows();response=await post(body(),other);eq(response.status,baseline?500:404);eq(await rows(),deniedBefore);
  response=await post({ids:['source-a'],operationId:randomUUID()});eq(response.status,400);eq(await rows(),deniedBefore);
  const publicRequest=new Request('http://localhost/api/canvas/stitch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body())});eq((await route.POST(publicRequest)).status,401);
  eq((await admin.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,0);
  eq((await admin.query('SELECT count(*)::int n FROM app_image_jobs')).rows[0].n,0);
  eq(await Promise.all(urls.map(async(url:string,index:number)=>(await read.readManagedObject(url,1024*1024)).bytes.equals(bytes[index]))),[true,true]);
  if(!baseline){
   const replayQuery='/api/canvas/stitch?operationId='+simultaneous.operationId;
   eq((await route.GET(new Request('http://localhost'+replayQuery,{headers:{cookie:cookie(other)}}))).status,200);
   eq((await(await route.GET(new Request('http://localhost'+replayQuery,{headers:{cookie:cookie(other)}}))).json()).result,null);
   const otherRoot='other-project';await admin.query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,group_id,source_url,origin)VALUES($1,$2,'other','main','','completed',$3,'',$1,'canvas-add','canvas')",[otherRoot,email,urls[0]]);
   eq((await route.GET(new Request('http://localhost'+replayQuery,{headers:{cookie:cookie(email),'x-naumi-project-context':'tree:'+otherRoot,'x-naumi-workspace':'personal'}}))).status,409);
   // Legacy callers keep their original POST shape; absence of operationId is
   // not retroactively promoted to an idempotent receipt contract.
   const legacy=body();delete(legacy as {operationId?:string}).operationId;eq((await post(legacy)).status,200);
   const beforeLimit=await rows();eq((await post({ids:Array.from({length:13},(_,i)=>'source-'+i),operationId:randomUUID()})).status,400);eq(await rows(),beforeLimit);
   console.log('PASS foreign owner receives no receipt;wrong project is denied;legacy POST and original input limit retained');
  }
  for(let i=0;i<2;i++)await admin.query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,group_id,batch_id,source_url,origin)VALUES($1,$2,'suite source','detail','','completed',$3,'',$1,'suite-stitch','canvas-add','canvas')",['suite-source-'+i,email,urls[i]]);
  const batchResponse=await route.POST(new Request('http://localhost/api/canvas/stitch',{method:'POST',headers:{cookie:cookie(email),origin:'http://localhost','content-type':'application/json','x-naumi-workspace':'personal','x-naumi-project-context':'batch:suite-stitch'},body:JSON.stringify({...body(),ids:['suite-source-0','suite-source-1']})}));
  eq(batchResponse.status,baseline?500:200);
  if(!baseline){const item=await batchResponse.json();eq(item.projectKey,'batch:suite-stitch');eq((await admin.query('SELECT batch_id FROM app_artworks WHERE id=$1',[item.id])).rows[0].batch_id,'suite-stitch');}
  const files=await readdir(media,{recursive:true});
  await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:baseline?'REPRODUCED':'PASS',checks,sourceRoot:root,actualRoute:true,realPG:true,realSharp:true,observations,posts,mediaFiles:files,supplier:0,consume:0},null,2)+'\n');
  console.log(`CANVAS_STITCH_PG=${baseline?'REPRODUCED':'PASS'} CHECKS=${checks} ROUTE=ACTUAL PG=REAL SHARP=REAL SUPPLIER=0 CONSUME=0`);
 }finally{
  if(platform)await platform.closeDatabasePools();
  await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();
  assert(path.resolve(media).startsWith(path.resolve(out)+path.sep));await rm(media,{recursive:true,force:true});
  console.log('CANVAS_STITCH_PG_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 POOLS_CLOSED=1 OWN_MEDIA_REMOVED=1');
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
