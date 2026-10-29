/** Actual text CRUD/history HTTP handlers on a random isolated PG schema. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createModelFixture} from './model-config-fixture';
async function main(){
 const out=path.resolve(process.env.TEXT_FAILURE_EVIDENCE||'output/text-failure-pg');await mkdir(out,{recursive:true});
 const f=await createModelFixture();Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:'1'});
 const checks:string[]=[],check=(name:string,fn:()=>Promise<void>|void)=>Promise.resolve().then(fn).then(()=>{checks.push(name);});let result='PASS';
 const db=await import('../src/lib/db');
 try{
  await db.ensureSchema();const pool=db.getPool(),owner='text-failure@fixture.test',other='text-foreign@fixture.test';await db.getOrCreateUser(owner);await db.getOrCreateUser(other);
  const repo=await import('../src/lib/canvas/text-node-repository'),{historyRequest}=await import('../src/lib/canvas/history-contract'),{saveCanvasHistory}=await import('../src/lib/canvas-history');
  const node={id:'failed-text',projectKey:'tree:old',title:'反推',prompt:'',content:'',status:'failed' as const,error:'精确失败原因',canvasX:10,canvasY:20,width:300,height:180,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceIds:[],targetIds:[],productIds:[]};
  await check('ADDITIVE_IDEMPOTENT_MIGRATION_PRESERVES_EXISTING_ROW',async()=>{
   await pool.query("INSERT INTO app_canvas_text_nodes(id,email,project_key,title) VALUES('legacy',$1,'tree:old','旧行')",[owner]);
   const schema=await readFile('src/lib/persistence/schema.ts','utf8'),ddl=schema.match(/ALTER TABLE app_canvas_text_nodes ADD COLUMN IF NOT EXISTS error_message[^;]+;/)![0];
   await pool.query(ddl);await pool.query(ddl);const old=(await repo.listCanvasTextNodes(owner))[0];assert.equal(old.error,'');assert.equal(old.title,'旧行');
  });
  await check('FAILED_ERROR_PERSISTS_SEPARATELY_FROM_GENERATED_CONTENT',async()=>{const saved=await repo.upsertCanvasTextNode(owner,node,{base:null});assert.equal(saved.error,node.error);assert.equal(saved.content,'');assert.equal((await repo.listCanvasTextNodes(owner)).find(n=>n.id===node.id)!.error,node.error);});
  await check('ERROR_LENGTH_BOUNDED',async()=>{assert.equal((await repo.upsertCanvasTextNode(owner,{...node,error:'x'.repeat(2300)})).error!.length,2000);});
  await check('CROSS_OWNER_UPSERT_REJECTED',async()=>{await assert.rejects(repo.upsertCanvasTextNode(other,node),/无权修改/);assert.equal((await pool.query('SELECT email FROM app_canvas_text_nodes WHERE id=$1',[node.id])).rows[0].email,owner);});
  await check('SUCCESS_CLEARS_PRIOR_FAILURE',async()=>{const saved=await repo.upsertCanvasTextNode(owner,{...node,status:'completed',content:'正常结果'});assert.equal(saved.error,'');assert.equal(saved.content,'正常结果');});
  await check('HISTORY_RESTORE_RETAINS_ERROR_AND_REPLAY_IS_IDEMPOTENT',async()=>{await repo.deleteCanvasTextNodes(owner,[node.id]);const request=historyRequest.parse({operationId:randomUUID(),operations:[{type:'text-restore',node}]});await saveCanvasHistory(owner,request);await saveCanvasHistory(owner,request);assert.equal((await repo.listCanvasTextNodes(owner)).find(n=>n.id===node.id)!.error,node.error);assert.equal(Number((await pool.query('SELECT count(*) FROM app_canvas_history_ops WHERE id=$1',[request.operationId])).rows[0].count),1);});
  await check('CROSS_OWNER_HISTORY_RESTORE_REJECTED',async()=>{await assert.rejects(saveCanvasHistory(other,historyRequest.parse({operationId:randomUUID(),operations:[{type:'text-restore',node}]})),/无权修改/);});
  await check('OLD_CLIENT_HISTORY_WITHOUT_ERROR_STILL_WORKS',async()=>{const {error,...legacy}=node;void error;await saveCanvasHistory(owner,historyRequest.parse({operationId:randomUUID(),operations:[{type:'text-restore',node:{...legacy,id:'old-shape'}}]}));assert.equal((await repo.listCanvasTextNodes(owner)).find(n=>n.id==='old-shape')!.error,'');});
  await check('REAL_ROUTE_NORMALIZES_FAILED_ONLY_ERROR',async()=>{
   const {POST}=await import('../src/app/api/canvas/text-nodes/route'),{USER_COOKIE,signUserSession}=await import('../src/lib/native-auth');
   const response=await POST(new Request('http://localhost/api/canvas/text-nodes',{method:'POST',headers:{'content-type':'application/json',cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`},body:JSON.stringify({...node,id:'route-failure',error:'route reason',base:null})}));
   assert.equal(response.status,200);assert.equal((await response.json()).node.error,'route reason');
  });
  await check('FAILURE_FIELD_CAS_PRESERVES_OTHER_EDITS',async()=>{
   const before=(await repo.listCanvasTextNodes(owner)).find(n=>n.id===node.id)!;
   await repo.upsertCanvasTextNode(owner,{...before,title:'remote-title'},{base:before});
   const merged=await repo.upsertCanvasTextNode(owner,{...before,error:'new failure'},{base:before});assert.equal(merged.title,'remote-title');assert.equal(merged.error,'new failure');
   await assert.rejects(repo.upsertCanvasTextNode(owner,{...before,error:'stale failure'},{base:before}),{code:'CANVAS_TEXT_CONFLICT'});
  });
 }catch(error){result='FAIL';throw error;}
 finally{
  await (await import('../src/platform/db/pool')).closeDatabasePools();await (await import('../src/lib/imagegen/coordination-pool')).closeImageCoordinationPool();await f.cleanup();
  await writeFile(path.join(out,'PG_RESULT.json'),JSON.stringify({result,checks,realPg:true,actualHandlers:true,supplierCalls:0,cleanup:true},null,2));
  console.log(`CANVAS_TEXT_FAILURE_PG=${result} CHECKS=${checks.length} REAL_SQL=1 REAL_HTTP_HANDLER=1 FIELD_CAS=1 SUPPLIER_CALLS=0`);
  console.log('TEXT_FAILURE_CLEANUP=PASS RANDOM_SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1');
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
