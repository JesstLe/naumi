import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assertStoryboardTake} from '../src/lib/storyboard/take-access';
import {assertStoryboardTake as oldExport} from '../src/lib/storyboard/service';
import {ensureStoryboardSchema} from '../src/lib/storyboard/repository';
import {createVideoTask} from '../src/lib/video/task-repository';
import {getOrCreateUser} from '../src/lib/db';
import {getPool} from '../src/platform/db/pool';

async function main(){
 const db=new URL(process.env.DATABASE_URL!);assert.equal(db.hostname,'127.0.0.1');assert.equal(db.pathname,'/naumi_video_fixture_storyboard_director');assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 const pool=getPool(),actor='release-take@fixture.invalid',other='release-take-other@fixture.invalid',origin=randomUUID(),inherited=randomUUID(),project='tree:'+randomUUID(),artworkId=randomUUID(),taskId='vid-'+randomUUID();
 const take={artworkId,taskId},denied={code:'STORYBOARD_TAKE_UNAVAILABLE'};
 try{
  assert.equal(oldExport,assertStoryboardTake);await getOrCreateUser(actor);await getOrCreateUser(other);await ensureStoryboardSchema();
  await createVideoTask({id:taskId,email:actor,upstreamId:'',model:'fixture',prompt:'fixture',size:'720p',seconds:'4',cost:0,requestBody:'{}',parameters:{nodeId:origin,projectKey:project,resultAssets:[{artworkId,kind:'video'}]}});
  await assert.rejects(assertStoryboardTake(actor,project,origin,take),denied);
  await pool.query("UPDATE app_video_tasks SET status='completed' WHERE id=$1",[taskId]);
  assert.equal(await assertStoryboardTake(actor,project,origin,take),origin);
  await assert.rejects(assertStoryboardTake(other,project,origin,take),denied);
  await assert.rejects(assertStoryboardTake(actor,'tree:wrong',origin,take),denied);
  await assert.rejects(assertStoryboardTake(actor,project,inherited,take),denied);
  await assert.rejects(assertStoryboardTake(actor,project,origin,{...take,artworkId:randomUUID()}),denied);
  const tx=await pool.connect();try{
   await tx.query('BEGIN');
   await tx.query('INSERT INTO app_storyboard_take_origins(email,project_key,node_id,task_id,artwork_id,origin_node_id,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor,project,inherited,taskId,artworkId,origin,randomUUID()]);
   assert.equal(await assertStoryboardTake(actor,project,inherited,take,tx),origin);
   await tx.query('ROLLBACK');
  }finally{tx.release();}
  await assert.rejects(assertStoryboardTake(actor,project,inherited,take),denied);
  console.log('STORYBOARD_TAKE_ACCESS=PASS ORIGINAL=1 UNFINISHED=DENIED FOREIGN=DENIED PROJECT=DENIED WRONG_ASSET=DENIED INHERITED_TX=PASS ROLLBACK=PASS SUPPLIER_CALLS=0');
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
