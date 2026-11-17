import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {NotificationStore} from '../services/enterprise-workflow/src/notification-store';
import {resolveDatabaseActor} from '../services/enterprise-workflow/src/identity';
import {readScope} from '../services/enterprise-workflow/src/read-scope';

type Query={sql:string;args:unknown[]};
type PlanNode={'Node Type':string;'Relation Name'?:string;'Alias'?:string;'Index Name'?:string;'Actual Loops':number;'Plan Width':number;'Shared Hit Blocks':number;'Shared Read Blocks':number;'Temp Written Blocks'?:number;Plans?:PlanNode[]};

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
    'teamId',CASE WHEN i<=15 THEN $3::text ELSE $2::text END,'requester',$4::text,'tasks','[]'::jsonb,
    'title','订单规格确认与阶段交付','brief',(SELECT string_agg(md5(p::text || i::text),'') FROM generate_series(1,160)p))
   FROM (SELECT i,lpad(to_hex(i),32,'0')::uuid id FROM generate_series(1,5000)i) o`,[enterprise,team,other,subject]);
  await pool.query(`INSERT INTO enterprise_workflow.notifications(id,enterprise_id,team_id,subject,event_id,order_id,action,actor,title,aggregate_version,created_at,read_at)
   SELECT gen_random_uuid(),$1,$2,$3,i::text,lpad(to_hex((i%5000)+1),32,'0')::uuid,'notice','fixture','load test',1,
    now()-(i/3)*interval '1 second',CASE WHEN i<=30 THEN NULL ELSE now() END FROM generate_series(1,80000)i`,[enterprise,team,subject]);
  await pool.query('ANALYZE enterprise_workflow.notifications; ANALYZE enterprise_workflow.orders');
  let queries:Query[]=[];
  // Capture the actual store's SQL and bound actor, including order visibility.
  const observed=new Proxy(pool,{get(target,k){
   if(k==='connect')return async()=>new Proxy(await target.connect(),{get(client,key){
    if(key==='query')return (...args:unknown[])=>{if(typeof args[0]==='string')queries.push({sql:args[0],args:(args[1] as unknown[])??[]});return Reflect.apply(client.query,client,args);};
    const value=Reflect.get(client,key);return typeof value==='function'?value.bind(client):value;
   }});
   const value=Reflect.get(target,k);return typeof value==='function'?value.bind(target):value;
  }});
  const pick=(s:string)=>{const match=queries.filter(q=>q.sql.includes(s));assert.equal(match.length,1,s);return match[0];};
  const plan=async(q:Query)=>{
   const r=(await pool.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+q.sql,q.args)).rows[0]['QUERY PLAN'][0] as {Plan:PlanNode};
   const nodes:PlanNode[]=[];
   const inspect=(n:PlanNode)=>{nodes.push(n);for(const child of n.Plans??[])inspect(child);};inspect(r.Plan);
   return {buffers:r.Plan['Shared Hit Blocks']+r.Plan['Shared Read Blocks'],temp:r.Plan['Temp Written Blocks']??0,nodes};
  };
  const store=new NotificationStore(observed,resolveDatabaseActor),read=()=>store.read({enterpriseId:enterprise,teamId:team,subject},{action:'badge'});
  const before=await read();assert.deepEqual(before,{unread:16});
  const badge=pick('SELECT count(*) AS unread'),unindexed=await plan(badge);
  const indexSql=await readFile(new URL('maintenance/notification-unread-index.sql',root),'utf8');
  await pool.query(indexSql);await pool.query(indexSql);
  const index=(await pool.query("SELECT indisready,indisvalid FROM pg_index WHERE indexrelid='enterprise_workflow.notification_inbox_unread'::regclass")).rows[0];
  assert.deepEqual(index,{indisready:true,indisvalid:true});
  await pool.query('ANALYZE enterprise_workflow.notifications');
  assert.deepEqual(await read(),before);
  const indexed=await plan(badge);
  assert(indexed.nodes.some(n=>n['Relation Name']==='notifications'&&n['Index Name']==='notification_inbox_unread'));
  assert(indexed.buffers*4<unindexed.buffers,JSON.stringify({before:unindexed.buffers,after:indexed.buffers}));
  console.log(`NOTIFICATION_BADGE_PLAN_PASS history=80000 unread_stored=30 visible=16 buffers=${unindexed.buffers}->${indexed.buffers} online_index=1`);

  const actor={enterpriseId:enterprise,teamId:team,subject},scope=`n.enterprise_id=$1 AND n.team_id=$2 AND ${readScope('o.document','$7')}`;
  const inboxFrom=`FROM enterprise_workflow.notifications n JOIN enterprise_workflow.orders o ON o.enterprise_id=n.enterprise_id AND o.id=n.order_id WHERE ${scope} AND n.subject=$4`;
  queries=[];
  const unread=await store.read(actor,{action:'inbox',unread:'1'});
  assert.equal(unread.total,16);assert.equal(unread.unread,16);assert.equal(unread.notifications?.length,16);
  assert(unread.notifications?.every(row=>row.readAt===null));
  const newUnread=pick('SELECT count(*) AS total');
  const originalInboxCount={sql:`SELECT count(*) AS total,count(*) FILTER(WHERE n.read_at IS NULL) AS unread ${inboxFrom}`,args:newUnread.args};
  const allCount=(await pool.query(originalInboxCount.sql,originalInboxCount.args)).rows[0];
  assert.deepEqual(allCount,{total:'79760',unread:'16'});
  const unreadBefore=await plan(originalInboxCount),unreadAfter=await plan(newUnread);
  assert(unreadAfter.buffers*4<unreadBefore.buffers);
  queries=[];
  const inbox=await store.read(actor,{action:'inbox',page:2000});
  assert.equal(inbox.total,79760);assert.equal(inbox.unread,16);
  const oldInboxPage={sql:`SELECT n.id,n.order_id AS "orderId",n.task_id AS "taskId",n.title,n.action,n.actor,n.aggregate_version AS "orderVersion",
   n.created_at AS "createdAt",n.read_at AS "readAt",o.document->>'title' AS "orderTitle"
   ${inboxFrom} ORDER BY n.created_at DESC,n.id LIMIT 30 OFFSET $8`,args:pick('WITH page AS MATERIALIZED').args};
  const oldInboxRows=(await pool.query(oldInboxPage.sql,oldInboxPage.args)).rows;
  assert.equal(oldInboxRows.length,30);assert.deepEqual(inbox.notifications,oldInboxRows);
  const inboxBefore=await plan(oldInboxPage),inboxAfter=await plan(pick('WITH page AS MATERIALIZED'));
  assert(inboxAfter.buffers*3<inboxBefore.buffers);
  console.log(`NOTIFICATION_INBOX_PLAN_PASS exact_count=${inbox.total} unread_buffers=${unreadBefore.buffers}->${unreadAfter.buffers} deep_buffers=${inboxBefore.buffers}->${inboxAfter.buffers} equal_rows=30`);

  await pool.query(`UPDATE enterprise_workflow.team_members SET permissions='["manage","request"]' WHERE enterprise_id=$1 AND team_id=$2`,[enterprise,team]);
  await pool.query(`INSERT INTO enterprise_workflow.notification_deliveries(id,notification_id,enterprise_id,team_id,subject,connector_id,policy_version,binding_version,state,receipt,created_at)
   SELECT gen_random_uuid(),id,enterprise_id,team_id,subject,'fixture',1,1,CASE WHEN event_id::int%8=0 THEN 'blocked' ELSE 'delivered' END,
    '12345',created_at FROM enterprise_workflow.notifications`);
  // Scope is defined by the linked notification, even for a legacy copy of the
  // team's ID on the delivery row that does not match it.
  await pool.query(`UPDATE enterprise_workflow.notification_deliveries d SET team_id=$2 FROM enterprise_workflow.notifications n
   WHERE d.notification_id=n.id AND n.enterprise_id=$1 AND n.event_id='79992'`,[enterprise,other]);
  await pool.query('ANALYZE enterprise_workflow.notification_deliveries');
  const deliveryFrom=`FROM enterprise_workflow.notification_deliveries d JOIN enterprise_workflow.notifications n ON n.id=d.notification_id
   JOIN enterprise_workflow.orders o ON o.enterprise_id=n.enterprise_id AND o.id=n.order_id WHERE ${scope} AND ($8='' OR d.state=$8)`;
  for(const [state,pageNumber,expectedTotal] of [['',2000,79760],['blocked',250,9968]] as const){
   queries=[];
   const result=await store.read(actor,{action:'deliveries',page:pageNumber,state});
   const combined=pick('WITH eligible AS MATERIALIZED'),oldTotal={sql:`SELECT count(*) AS total ${deliveryFrom}`,args:combined.args.slice(0,-1)};
   const oldPage={sql:`SELECT d.id,d.subject,d.version,d.connector_id AS "connectorId",d.state,d.attempts,d.polls,d.receipt,
    d.receipt_source AS "receiptSource",d.provider_read AS "providerRead",d.error_code AS "errorCode",d.created_at AS "createdAt",
    d.updated_at AS "updatedAt",n.title,n.order_id AS "orderId",o.document->>'title' AS "orderTitle"
    ${deliveryFrom} ORDER BY d.created_at DESC,d.id LIMIT 30 OFFSET $9`,args:combined.args};
   assert.equal(result.total,expectedTotal);assert.equal(result.deliveries?.length,30);
   assert.equal((await pool.query(oldTotal.sql,oldTotal.args)).rows[0].total,String(expectedTotal));
   assert.deepEqual(result.deliveries,(await pool.query(oldPage.sql,oldPage.args)).rows);
   const a=await plan(oldTotal),b=await plan(oldPage),c=await plan(combined);
   const beforeBuffers=a.buffers+b.buffers;assert(c.buffers*1.3<beforeBuffers);
   assert(c.nodes.some(n=>n['Node Type']==='Sort'&&n['Plan Width']===24));
   queries=[];
   assert.deepEqual(await store.read(actor,{action:'deliveries',page:10000,state}),{deliveries:[],total:expectedTotal,page:10000,pageSize:30});
   const empty=await plan(pick('WITH eligible AS MATERIALIZED'));
   assert(empty.nodes.find(n=>n['Node Type']==='Limit')?.['Actual Loops']===1);
   const hydration=empty.nodes.filter(n=>['payload','notice','doc'].includes(n.Alias??''));
   assert.equal(hydration.length,3);
   assert(hydration.every(n=>n['Shared Hit Blocks']+n['Shared Read Blocks']===0),JSON.stringify(hydration));
   console.log(`NOTIFICATION_DELIVERY_PLAN_PASS state=${state||'all'} total=${expectedTotal} deep_buffers=${beforeBuffers}->${c.buffers} temp_blocks=${b.temp}->${c.temp} past_end_payload_reads=0`);
  }
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
