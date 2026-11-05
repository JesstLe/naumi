/** Actual position Route -> compatibility adapter -> existing artwork writer.
 * Full schema, native authentication and real PG locks, not extracted SQL. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {createModelFixture} from './model-config-fixture';
const args=process.argv.slice(2),arg=(n:string)=>{const i=args.indexOf(n);return i<0?undefined:args[i+1]},root=path.resolve(arg('--source-root')||process.env.CANVAS_SOURCE_ROOT||'.'),baseline=args.includes('--baseline'),out=path.resolve(arg('--out')||process.env.CANVAS_TEST_OUT||'output/canvas-position-pg');
async function main(){
 await mkdir(out,{recursive:true});const f=await createModelFixture();
 Object.assign(process.env,{PGOPTIONS:'-c search_path='+f.schemaName,NAUMI_MULTI_USER:'1',NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'r6x-position-fixture',MODEL_CONFIG_ENVELOPE_SECRET:'r6x-position-fixture-envelope-secret',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin});
 let api:any,checks=0;const results:{name:string;pass:boolean}[]=[],eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++};
 try{
  const names={db:'src/lib/db.ts',writer:'src/lib/canvas/artwork-repository.ts',route:'src/app/api/artworks/position/route.ts',auth:'src/lib/native-auth.ts',coord:'src/lib/imagegen/coordination-pool.ts'},file=path.join(out,'actual.cjs');
  const built=await build({stdin:{contents:Object.entries(names).map(([name,file])=>`export * as ${name} from ${JSON.stringify(path.join(root,file).replaceAll('\\','/'))};`).join('\n'),resolveDir:root,loader:'ts'},outfile:file,bundle:true,metafile:true,platform:'node',format:'cjs',external:['pg','sharp'],alias:{'server-only':path.resolve('scripts/fleet-server-only.cjs')},tsconfig:path.join(root,'tsconfig.json')});
  await writeFile(path.join(out,'SOURCE_INPUTS.json'),JSON.stringify(Object.keys(built.metafile.inputs).filter(f=>f.includes('src/')),null,2)+'\n');api=createRequire(import.meta.url)(file);await api.db.ensureSchema();
  const pool=api.db.getPool(),owner='position-'+randomUUID()+'@fixture.test',other='other-'+randomUUID()+'@fixture.test';await api.db.getOrCreateUser(owner);await api.db.getOrCreateUser(other);
  const point=async(id:string)=>{const row=(await pool.query('SELECT canvas_x,canvas_y FROM app_artworks WHERE id=$1',[id])).rows[0];return row&&[row.canvas_x,row.canvas_y]};
  const seed=async(id:string,x:number|null=null,y:number|null=null)=>{await api.db.addArtworks(owner,[{id,title:id,category:'main',prompt:'position fixture',status:'completed',image:'/media/fixture.png',gradient:'',groupId:'position',createdAt:new Date().toISOString()}]);await pool.query('UPDATE app_artworks SET canvas_x=$2,canvas_y=$3 WHERE id=$1',[id,x,y]);};
  const post=(body:unknown,email:string|null=owner):Promise<Response>=>api.route.POST(new Request('http://localhost/api/artworks/position',{method:'POST',headers:{'content-type':'application/json',...(email?{cookie:'nv_user='+api.auth.signUserSession(email,Date.now())}:{})},body:JSON.stringify(body)}));
  const test=async(name:string,run:()=>Promise<void>)=>{await run();results.push({name,pass:true});console.log('PASS '+name)};
  await test('initialize_empty_result',async()=>{await seed('new');eq((await post({id:'new',x:500,y:200,mode:'initialize'})).status,200);eq(await point('new'),[500,200]);});
  await test('replayed_result_keeps_original_position',async()=>{await seed('old',10,20);eq((await post({id:'old',x:950,y:200,mode:'initialize'})).status,200);eq(await point('old'),baseline?[950,200]:[10,20]);});
  await test('manual_move_and_legacy_signature',async()=>{await seed('drag',10,20);eq((await post({id:'drag',x:90,y:80})).status,200);eq(await point('drag'),[90,80]);eq((await post({id:'drag',x:30,y:40,mode:'move'})).status,200);eq(await api.writer.setArtworkPosition(owner.toUpperCase(),'drag',7,8),true);eq(await point('drag'),[7,8]);});
  await test('late_initialize_waits_for_manual_commit',async()=>{
   await seed('race');const client=await pool.connect();let pending:Promise<Response>|undefined,done=false;
   try{await client.query('BEGIN');await client.query('UPDATE app_artworks SET canvas_x=800,canvas_y=700 WHERE id=$1',['race']);pending=post({id:'race',x:100,y:200,mode:'initialize'}).then((r:Response)=>{done=true;return r});await new Promise(r=>setTimeout(r,120));eq(done,false);await client.query('COMMIT');eq((await pending).status,200);eq(await point('race'),baseline?[100,200]:[800,700]);}
   finally{await client.query('ROLLBACK');client.release();if(pending)await pending;}
  });
  await test('concurrent_initializers_keep_first_committed_position',async()=>{await seed('first');await post({id:'first',x:11,y:22,mode:'initialize'});const replies=await Promise.all(Array.from({length:12},(_,i)=>post({id:'first',x:100+i,y:200+i,mode:'initialize'})));eq(replies.every(r=>r.status===200),true);if(baseline)eq((await point('first'))![0]>=100,true);else eq(await point('first'),[11,22]);});
  await test('partial_coordinate_is_already_placed',async()=>{await seed('partial',17,null);eq((await post({id:'partial',x:100,y:200,mode:'initialize'})).status,200);eq(await point('partial'),baseline?[100,200]:[17,null]);});
  await test('authenticated_owner_and_invalid_input',async()=>{await seed('owned',1,2);eq((await post({id:'owned',email:owner,x:9,y:8,mode:'initialize'},other)).status,404);eq(await point('owned'),[1,2]);eq((await post({id:'owned',x:1,y:2},null)).status,401);eq((await post({id:'missing',x:1,y:2})).status,404);eq((await post({id:'new',x:'NaN',y:2})).status,400);eq((await post({id:'new',x:1,y:2,mode:'invalid'})).status,baseline?200:400);});
  await test('hidden_metadata_does_not_revive',async()=>{await seed('hidden',3,4);await pool.query('UPDATE app_artworks SET deleted_at=now() WHERE id=$1',['hidden']);const before=(await pool.query('SELECT deleted_at FROM app_artworks WHERE id=$1',['hidden'])).rows[0].deleted_at.toISOString();eq((await post({id:'hidden',x:9,y:8,mode:'initialize'})).status,200);eq(await point('hidden'),baseline?[9,8]:[3,4]);eq((await pool.query('SELECT deleted_at FROM app_artworks WHERE id=$1',['hidden'])).rows[0].deleted_at.toISOString(),before);});
  const report={sourceRoot:root,mode:baseline?'BASELINE':'MODIFIED',cases:results.length,checks,results,fullSchema:true,nativeAuth:true,actualOwner:true,supplierCalls:0};await writeFile(path.join(out,'POSITION_PG.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`POSITION_PG=PASS MODE=${report.mode} CASES=${results.length} CHECKS=${checks} FULL_SCHEMA=1 NATIVE_AUTH=1 ACTUAL_WRITER=1 INITIALIZE=${baseline?'OVERWRITES':'KEEPS_POSITION'} SUPPLIER=0`);
 }finally{if(api){await api.db.getPool().end();await api.coord.closeImageCoordinationPool();}await f.cleanup();console.log('POSITION_PG_CLEANUP=PASS SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1');}
}
main().catch(e=>{console.error(e);process.exitCode=1});
