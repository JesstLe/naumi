import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {canonical,digest,operationSchema,resultSchema,type FleetActor,type FleetOperation,type FleetResult} from '../../src/lib/fleet/contracts';

const databases=new Set(['fleet_protocol_fixture','fleet_central_103_20261104']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type RetainedState={state?:'queued'|'succeeded';result?:FleetResult;createdAt?:string};

/** Test-only reconstruction of a command accepted before the admission HOLD.
 * This is deliberately not an enqueue API or production activation switch.
 * Callers must establish public admission is closed before inserting history;
 * getters, dispatch, original leases/ACKs and receipts remain actual product code. */
export async function seedRetainedFleetBusinessCommand(pool:Pool,actor:string,instanceId:string,id:string,
  raw:FleetOperation,authority:FleetActor={actor,root:true},retained:RetainedState={}){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1','retained history requires the explicit isolated fixture flag');
  assert.equal(typeof pool.options.connectionString,'string','retained history requires a pinned fixture connection URL');
  const url=new URL(pool.options.connectionString!);
  assert.ok(url.protocol==='postgres:'||url.protocol==='postgresql:');
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'retained history must stay on loopback');
  assert.equal(url.port,'65298','retained history uses only the named disposable PG endpoint');
  assert.ok(!url.searchParams.has('host')&&!url.searchParams.has('port'),'retained history rejects host or port query overrides');
  const database=decodeURIComponent(url.pathname.slice(1));
  assert.ok(databases.has(database),'retained history rejects noncentral or unnamed fixture databases');
  assert.match(instanceId,uuid);assert.match(id,uuid);assert.ok(actor.length>0&&actor.length<=254);
  assert.equal(authority.actor,actor);assert.equal(typeof authority.root,'boolean');
  const operation=operationSchema.parse(raw);assert.equal(operation.type,'business.query','retained fixture never seeds mutations');
  assert.ok(Object.keys(retained).every(k=>['state','result','createdAt'].includes(k)));
  const state=retained.state??'queued';assert.ok(state==='queued'||state==='succeeded');
  const result=state==='succeeded'?resultSchema.parse(retained.result):null;
  if(state==='queued')assert.equal(retained.result,undefined);
  const createdAt=retained.createdAt??new Date().toISOString();assert.ok(Number.isFinite(Date.parse(createdAt)));
  const fingerprint=digest(canonical({instanceId,actor,operation}));
  const tx=await pool.connect();
  try{
    await tx.query('BEGIN');
    assert.equal((await tx.query('SELECT current_database() AS database')).rows[0].database,database,'physical fixture database binding');
    const inserted=await tx.query(`INSERT INTO app_fleet_commands(id,instance_id,actor,operation,fingerprint,requested_by_root,state,result,created_at,finished_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $7='succeeded' THEN $9::timestamptz ELSE NULL END)
      ON CONFLICT(id) DO NOTHING RETURNING id`,[id,instanceId,actor,JSON.stringify(operation),fingerprint,authority.root,state,result?JSON.stringify(result):null,createdAt]);
    const row=(await tx.query('SELECT instance_id,actor,fingerprint,requested_by_root,state FROM app_fleet_commands WHERE id=$1',[id])).rows[0];
    assert.ok(row);assert.equal(row.instance_id,instanceId);assert.equal(row.actor,actor);assert.equal(row.fingerprint,fingerprint);assert.equal(row.requested_by_root,authority.root);
    // An existing accepted identity wins: never reset its terminal state, lease,
    // result or timestamps to make a later fixture assertion pass.
    await tx.query('COMMIT');return{id,state:row.state as string,replayed:!inserted.rowCount,retainedFixtureOnly:true};
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
