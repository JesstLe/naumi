import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {NotificationStore} from '../services/enterprise-workflow/src/notification-store';
import {resolveDatabaseActor} from '../services/enterprise-workflow/src/identity';

async function main(){
 const url=new URL(process.env.DATABASE_URL!);
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 const pool=new Pool({connectionString:url.toString()}),enterprise=randomUUID(),team=randomUUID(),other=randomUUID(),subject='notice-load-fixture';
 try{
  assert.equal((await pool.query("SELECT to_regnamespace('enterprise_workflow') AS schema")).rows[0].schema,null,'use a fresh disposable database');
  const root=new URL('../services/enterprise-workflow/',import.meta.url);
  for(const file of ['001-workflow.sql','002-scheduling.sql','004-source-identity.sql','011-notifications.sql'])
   await pool.query(await readFile(new URL('migrations/'+file,root),'utf8'));
  await pool.query('INSERT INTO enterprise_workflow.teams(enterprise_id,team_id) VALUES($1,$2),($1,$3)',[enterprise,team,other]);
  await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject) VALUES($1,$2)',[enterprise,subject]);
  await pool.query(`INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds) VALUES($1,$2,$3,'["request"]','[]')`,[enterprise,team,subject]);
  await pool.query(`INSERT INTO enterprise_workflow.orders(enterprise_id,id,version,document)
   SELECT $1::uuid,id,1,jsonb_build_object('enterpriseId',$1::uuid::text,'id',id::text,'version',1,
    'teamId',CASE WHEN i<=15 THEN $3::text ELSE $2::text END,'requester',$4::text,'tasks','[]'::jsonb)
   FROM (SELECT i,lpad(to_hex(i),32,'0')::uuid id FROM generate_series(1,5000)i) o`,[enterprise,team,other,subject]);
  await pool.query(`INSERT INTO enterprise_workflow.notifications(id,enterprise_id,team_id,subject,event_id,order_id,action,actor,title,aggregate_version,created_at,read_at)
   SELECT gen_random_uuid(),$1,$2,$3,i::text,lpad(to_hex((i%5000)+1),32,'0')::uuid,'notice','fixture','load test',1,
    now()-i*interval '1 second',CASE WHEN i<=30 THEN NULL ELSE now() END FROM generate_series(1,80000)i`,[enterprise,team,subject]);
  await pool.query('ANALYZE enterprise_workflow.notifications; ANALYZE enterprise_workflow.orders');
  let badge:{sql:string;args:unknown[]}|undefined;
  // Measure the actual NotificationStore predicate with its bound actor, including order visibility.
  const observed=new Proxy(pool,{get(target,k){
   if(k==='connect')return async()=>new Proxy(await target.connect(),{get(client,key){
    if(key==='query')return (...args:unknown[])=>{if(typeof args[0]==='string'&&args[0].includes('SELECT count(*) AS unread'))badge={sql:args[0],args:args[1] as unknown[]};return Reflect.apply(client.query,client,args);};
    const value=Reflect.get(client,key);return typeof value==='function'?value.bind(client):value;
   }});
   const value=Reflect.get(target,k);return typeof value==='function'?value.bind(target):value;
  }});
  type Node={'Relation Name'?:string;'Index Name'?:string;'Shared Hit Blocks':number;'Shared Read Blocks':number;Plans?:Node[]};
  const plan=async()=>{
   assert(badge);
   const r=(await pool.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+badge.sql,badge.args)).rows[0]['QUERY PLAN'][0] as {Plan:Node};
   const indexes:string[]=[];
   const inspect=(n:Node)=>{if(n['Relation Name']==='notifications'&&n['Index Name'])indexes.push(n['Index Name']);for(const child of n.Plans??[])inspect(child);};inspect(r.Plan);
   return {buffers:r.Plan['Shared Hit Blocks']+r.Plan['Shared Read Blocks'],indexes};
  };
  const store=new NotificationStore(observed,resolveDatabaseActor),read=()=>store.read({enterpriseId:enterprise,teamId:team,subject},{action:'badge'});
  const before=await read();assert.deepEqual(before,{unread:16});
  const unindexed=await plan();
  const indexSql=await readFile(new URL('maintenance/notification-unread-index.sql',root),'utf8');
  await pool.query(indexSql);await pool.query(indexSql);
  const index=(await pool.query("SELECT indisready,indisvalid FROM pg_index WHERE indexrelid='enterprise_workflow.notification_inbox_unread'::regclass")).rows[0];
  assert.deepEqual(index,{indisready:true,indisvalid:true});
  await pool.query('ANALYZE enterprise_workflow.notifications');
  assert.deepEqual(await read(),before);
  const indexed=await plan();
  assert(indexed.indexes.includes('notification_inbox_unread'),JSON.stringify(indexed));
  assert(indexed.buffers*4<unindexed.buffers,JSON.stringify({unindexed,indexed}));
  console.log(`NOTIFICATION_BADGE_PLAN_PASS history=80000 unread_stored=30 visible=16 buffers=${unindexed.buffers}->${indexed.buffers} online_index=1`);
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
