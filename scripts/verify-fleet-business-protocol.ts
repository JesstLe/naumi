import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {fleetBusinessQuerySchema,parseFleetBusinessSnapshot,FLEET_BUSINESS_MAX_BYTES} from '../src/lib/fleet/business-contracts';
import {operationSchema,statusSchema,commandCapability,signCommand,verifyCommand,resultSchema} from '../src/lib/fleet/contracts';
import {readFleetBusinessQuery} from '../src/lib/fleet/business-read-model';
import {localAppOrigin,localAppHost,localFleetStatus} from '../src/lib/fleet/local-status';
import {verifyFleetBusinessQueueCompatibility} from './verify-fleet-business-queue-compat';

let checks=0;
function check(value:unknown,message:string){assert.ok(value,message);checks++;}
const asOf='2026-11-04T08:00:00.000Z';
const query=(view:'overview'|'usage'|'users'|'orders'|'ledger'|'creations'='usage',extra:Record<string,unknown>={})=>fleetBusinessQuerySchema.parse({type:'business.query',view,days:30,asOf,page:1,search:'',...extra});
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
  const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/fleet_protocol_fixture');
  process.env.PGPOOL_MAX='1';process.env.FLEET_PORTAL_ONLY='1';
  const pool=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:3000});
  const envKeys=['FLEET_SINGLE_APP_ORIGIN','FLEET_SINGLE_APP_HOST','FLEET_APP_ORIGIN','FLEET_DESKTOP_ORIGIN','FLEET_ENTERPRISE_ORIGIN','FLEET_ACTIVE_SLOTS_FILE'] as const;
  const beforeEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));const originalFetch=globalThis.fetch;
  try{
    // This exact database is the disposable, explicitly named local fixture.
    await pool.query(`DROP SCHEMA public CASCADE;CREATE SCHEMA public;
      CREATE TABLE app_users(email text PRIMARY KEY,name text,plan text DEFAULT 'starter',role text DEFAULT 'user',banned boolean DEFAULT false,
        credits_total int DEFAULT 0,credits_used int DEFAULT 0,auth_revoked_before timestamptz,account_expires_at timestamptz);
      CREATE TABLE app_settings(k text PRIMARY KEY,v text);
      CREATE TABLE app_ledger(id text PRIMARY KEY,email text,delta int,kind text,reason text,created_at timestamptz);
      CREATE TABLE app_credit_batches(id text PRIMARY KEY,email text,remaining int,expires_at timestamptz);
      CREATE TABLE app_billing_operations(id text PRIMARY KEY,email text,ledger_id text,feature text);
      CREATE TABLE app_orders(id text PRIMARY KEY,email text,title text,kind text,credits int,amount int,status text,created_at timestamptz,paid_at timestamptz);
      CREATE TABLE app_artworks(id text PRIMARY KEY,email text,title text,created_at timestamptz,group_id text,video_url text,status text,deleted_at timestamptz,image_url text DEFAULT 'https://private.invalid/image');
      CREATE TABLE app_fleet_applied(id uuid PRIMARY KEY,fingerprint text NOT NULL,result jsonb NOT NULL,instance_id uuid,actor text,operation jsonb,created_at timestamptz DEFAULT now());
      INSERT INTO app_users(email,name,credits_total,credits_used)VALUES('alice@fixture.test','Alice',9999,7),('bob@fixture.test','Bob',9999,0);
      INSERT INTO app_credit_batches VALUES('live-a','alice@fixture.test',100,now()+interval '1 day'),('expired-a','alice@fixture.test',900,now()-interval '1 day'),('negative-a','alice@fixture.test',-50,now()+interval '1 day'),('live-b','bob@fixture.test',50,now()+interval '1 day');
      INSERT INTO app_ledger VALUES
      ('charge-a','alice@fixture.test',-10,'consume','图片生成','2026-11-03T16:30:00Z'),
      ('charge-b','bob@fixture.test',-5,'consume','视频生成','2026-11-03T15:30:00Z'),
      ('admin-legacy','alice@fixture.test',-100,'consume','管理员调整积分','2026-11-03T16:30:00Z'),
      ('admin-custom','alice@fixture.test',-200,'consume','自定义后台扣减','2026-11-03T16:30:00Z'),
      ('refund-a','alice@fixture.test',3,'refund','退款','2026-11-03T16:30:00Z'),
      ('expire-a','alice@fixture.test',-900,'expire','积分过期','2026-11-03T16:30:00Z'),
      ('grant-a','alice@fixture.test',500,'grant','赠送','2026-11-03T16:30:00Z'),
      ('old','alice@fixture.test',-400,'consume','窗口之前','2026-09-01T00:00:00Z'),
      ('boundary','alice@fixture.test',-800,'consume','窗口上界不含','2026-11-04T08:00:00Z'),
      ('orphan','deleted@fixture.test',-2,'consume','保留历史消费','2026-11-03T16:30:00Z');
      INSERT INTO app_billing_operations VALUES('adjust-op','alice@fixture.test','admin-custom','credits.adjust'),('other-account-id-collision','alice@fixture.test','charge-b','credits.adjust');
      INSERT INTO app_orders VALUES('order-paid','alice@fixture.test','充值套餐','pack',100,1200,'paid','2026-11-02T00:00:00Z','2026-11-02T00:01:00Z'),('order-pending','bob@fixture.test','待支付','pack',100,1200,'pending','2026-11-02T00:00:00Z',null);
      INSERT INTO app_artworks(id,email,title,created_at,group_id,video_url,status,deleted_at) SELECT 'art-'||lpad(i::text,2,'0'),'alice@fixture.test','作品'||i,'2026-11-03T08:00:00Z'::timestamptz,'project-one',CASE WHEN i=1 THEN 'https://private.invalid/movie' ELSE '' END,'completed',NULL FROM generate_series(1,35)i;
      INSERT INTO app_artworks(id,email,title,created_at,group_id,video_url,status,deleted_at) VALUES('deleted-work','alice@fixture.test','已删除','2026-11-03T08:00:00Z','project-one','','completed',now());
      UPDATE app_artworks SET image_url=NULL WHERE id='art-35';`);
    const fingerprint=async()=>{
      const result:Record<string,string>={};for(const table of ['app_users','app_ledger','app_credit_batches','app_billing_operations','app_orders','app_artworks'])
        result[table]=(await pool.query(`SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM ${table} t`)).rows[0].hash;
      result.schema=(await pool.query("SELECT md5(string_agg(table_name||'.'||column_name||':'||data_type,',' ORDER BY table_name,ordinal_position)) hash FROM information_schema.columns WHERE table_schema='public'")).rows[0].hash;return result;
    };
    const baseline=await fingerprint();
    const usage=await readFleetBusinessQuery(pool,query());
    check(usage.totals.credits===17,'settled consumption excludes custom/legacy administrator debits, reserve/expire/grant');
    check(usage.totals.refundCredits===3&&usage.totals.administrativeDebits===300,'refunds and admin debits stay separate');
    check(usage.totals.operations===3&&usage.totals.activeUsers===3,'deleted-account history retained');
    check(usage.totals.balance===143,'live unexpired principal minus held reserve, not stale cached total');
    check(usage.users.find(u=>u.email==='alice@fixture.test')?.balance===93,'alice current wallet balance');
    check(usage.users.find(u=>u.email==='alice@fixture.test')?.creditsTotal===100,'principal excludes expired/negative batches');
    check(usage.users.find(u=>u.email==='deleted@fixture.test')?.balance===null,'orphan balance unknown, not zero');
    check(usage.daily.find(d=>d.date==='2026-11-04')?.credits===12&&usage.daily.find(d=>d.date==='2026-11-03')?.credits===5,'Shanghai daily boundary');
    check(usage.totals.paidOrders===1&&usage.totals.paidAmount===1200,'paid order cents only');
    check(usage.totals.users===2&&usage.totals.artworks===35,'current registered users and visible artwork stock');
    for(const view of ['overview','users','orders','ledger','creations'] as const){
      const value=await readFleetBusinessQuery(pool,query(view));check(value.view===view,'view returned '+view);check(new TextEncoder().encode(JSON.stringify({status:'succeeded',data:{business:value}})).length<FLEET_BUSINESS_MAX_BYTES,'reply bounded '+view);
      if(view==='users')check(value.total===2,'users excludes deleted account identity');
      if(view==='orders')check(value.total===2&&value.orders.some(o=>o.status==='pending'),'order list retains pending, totals exclude unpaid');
      if(view==='ledger')check(value.total===8&&value.ledger.some(l=>l.id==='admin-custom'),'full raw ledger page does not relabel admin debit');
      if(view==='creations'){
        check(value.total===35&&value.creations.length===30&&!JSON.stringify(value).includes('private.invalid'),'sitewide artwork metadata has no private media URL');
        check(value.creations.find(c=>c.id==='art-35')?.type==='unknown'&&value.creations.some(c=>c.type==='image'),'missing media stays unknown alongside known images');
      }
    }
    const second=await readFleetBusinessQuery(pool,query('creations',{page:2}));check(second.creations.length===5&&second.total===35,'deterministic second metadata page');
    check(second.creations.find(c=>c.id==='art-01')?.type==='video','video metadata correctly classified without returning URL');
    const selected=await readFleetBusinessQuery(pool,query('usage',{email:'alice@fixture.test'}));check(selected.totals.credits===10&&selected.users.length===1,'exact account filter');
    const orphan=await readFleetBusinessQuery(pool,query('usage',{email:'deleted@fixture.test'}));check(orphan.totals.balance===null&&orphan.totals.credits===2,'orphan selected known consumption/unknown balance');
    const search=await readFleetBusinessQuery(pool,query('users',{search:"' OR true --"}));check(search.users.length===0&&search.totals.credits===0,'search parameterized');
    const {applyFleetCommand}=await import('../src/lib/fleet/connector');
    const command={id:randomUUID(),instanceId:randomUUID(),actor:'admin@central.fixture',expiresAt:Date.now()+300000,operation:query()};
    const first=await applyFleetCommand(command,command.instanceId);check(first.status==='succeeded','real metadata receipt on poolmax1');
    await pool.query("INSERT INTO app_ledger VALUES('after-receipt','alice@fixture.test',-1,'consume','later live activity','2026-11-03T16:30:00Z')");
    const replay=await applyFleetCommand(command,command.instanceId);check(JSON.stringify(replay)===JSON.stringify(first),'lost ACK returns first immutable winner, not recomputed receipt');
    await pool.query("DELETE FROM app_ledger WHERE id='after-receipt'");
    await assert.rejects(()=>applyFleetCommand({...command,operation:query('orders')},command.instanceId),/FLEET_ID_CONFLICT/);checks++;
    const concurrent={...command,id:randomUUID()};const both=await Promise.all([applyFleetCommand(concurrent,command.instanceId),applyFleetCommand(concurrent,command.instanceId)]);
    check(JSON.stringify(both[0])===JSON.stringify(both[1]),'concurrent readonly duplication one stable receipt');
    check((await fingerprint()).schema===baseline.schema,'business command did not run global bootstrap or any DDL');
    const after=await fingerprint();check(JSON.stringify(after)===JSON.stringify(baseline),'all six business-table bytes preserved');
    await pool.query('ALTER TABLE app_billing_operations RENAME TO hidden_billing_operations');
    const missing=await applyFleetCommand({...command,id:randomUUID()},command.instanceId);check(missing.status==='failed'&&missing.code==='UNAVAILABLE','missing provenance produces explicit unavailable, not zero usage');
    await pool.query('ALTER TABLE hidden_billing_operations RENAME TO app_billing_operations');
    const {fleetBusinessInstances,fleetReadCommand,ensureFleetSchema,createInstance,saveGrant,enqueueCommand,fleetSnapshot,connectorExchange}=await import('../src/lib/fleet/server');
    await ensureFleetSchema();
    await pool.query("INSERT INTO app_users(email,name) VALUES('delegate@fixture.test','Delegate')");
    const instance=await createInstance('root','Fixture enterprise','enterprise');
    await saveGrant('root',{instanceId:instance.id,email:'delegate@fixture.test',allowed:['read'],expectedVersion:0,expiresAt:null});
    const queuedId=randomUUID();await enqueueCommand('root',instance.id,queuedId,{...query(),asOf:new Date().toISOString()});
    check((await fleetBusinessInstances({actor:'delegate@fixture.test',root:false})).length===0,'read-only grant cannot see business source');
    await assert.rejects(()=>fleetReadCommand({actor:'delegate@fixture.test',root:false},instance.id,queuedId),/实例操作未授权/);checks++;
    check(!(await fleetSnapshot({actor:'delegate@fixture.test',root:false})).commands.some(c=>c.id===queuedId),'generic fleet snapshot does not leak business command result');
    await saveGrant('root',{instanceId:instance.id,email:'delegate@fixture.test',allowed:['read','business'],expectedVersion:1,expiresAt:null});
    check((await fleetBusinessInstances({actor:'delegate@fixture.test',root:false})).length===1,'explicit business grant accepted');
    check((await fleetReadCommand({actor:'delegate@fixture.test',root:false},instance.id,queuedId))?.id===queuedId,'scoped command query accepted');
    await pool.query("UPDATE app_users SET banned=true WHERE email='delegate@fixture.test'");
    check((await fleetBusinessInstances({actor:'delegate@fixture.test',root:false})).length===0,'banned delegate cannot enumerate business sources');
    await assert.rejects(()=>fleetReadCommand({actor:'delegate@fixture.test',root:false},instance.id,queuedId),/实例操作未授权/);checks++;
    await pool.query("UPDATE app_users SET banned=false WHERE email='delegate@fixture.test'");
    await saveGrant('root',{instanceId:instance.id,email:'delegate@fixture.test',allowed:['read'],expectedVersion:2,expiresAt:null});
    await assert.rejects(()=>fleetReadCommand({actor:'delegate@fixture.test',root:false},instance.id,queuedId),/实例操作未授权/);checks++;
    await saveGrant('root',{instanceId:instance.id,email:'delegate@fixture.test',allowed:['read','business'],expectedVersion:3,expiresAt:null});
    await pool.query("UPDATE app_fleet_grants SET expires_at=now()-interval '1 minute' WHERE instance_id=$1",[instance.id]);
    check((await fleetBusinessInstances({actor:'delegate@fixture.test',root:false})).length===0,'expired business grant cannot enumerate sources');
    await assert.rejects(()=>fleetReadCommand({actor:'delegate@fixture.test',root:false},instance.id,queuedId),/实例操作未授权/);checks++;
    await pool.query('UPDATE app_fleet_grants SET expires_at=NULL WHERE instance_id=$1',[instance.id]);
    await pool.query('UPDATE app_fleet_instances SET enabled=false WHERE id=$1',[instance.id]);
    await assert.rejects(()=>fleetReadCommand({actor:'root',root:true},instance.id,queuedId),/实例未启用/);checks++;
    await pool.query('UPDATE app_fleet_instances SET enabled=true WHERE id=$1',[instance.id]);
    check(await fleetReadCommand({actor:'root',root:true},instance.id,randomUUID())===null,'missing command does not fabricate empty success');
    process.env.FLEET_CONTROL_ENABLED='1';process.env.SETTINGS_SECRET='fleet-protocol-fixture-012345678901234567890';
    const poll=(business?:1)=>new Request('https://central.fixture/api/fleet/poll',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+instance.token,'x-naumi-instance':instance.id},body:JSON.stringify({nonce:randomUUID(),timestamp:Date.now(),status:{source:'a'.repeat(40),version:'1',storage:'s3',nas:'unknown',connector:1,...(business?{business}:{})}})});
    const oldPoll=await connectorExchange(poll());
    check('command' in oldPoll&&oldPoll.command===null&&(await pool.query('SELECT state FROM app_fleet_commands WHERE id=$1',[queuedId])).rows[0].state==='queued','old connector leaves business query queued and unleased');
    const legacyId=randomUUID();await enqueueCommand('root',instance.id,legacyId,{type:'users.list',search:'',page:1});
    const legacyPoll=await connectorExchange(poll());
    check('command' in legacyPoll&&legacyPoll.command!=null&&JSON.parse(legacyPoll.command.payload).id===legacyId,'old connector can bypass new query to process compatible legacy operation');
    await pool.query("UPDATE app_fleet_commands SET state='succeeded',result=$2,finished_at=now() WHERE id=$1",[legacyId,JSON.stringify({status:'succeeded',data:{users:[],total:0,page:1}})]);
    const advertised=await connectorExchange(poll(1));
    check('command' in advertised&&advertised.command!=null&&JSON.parse(advertised.command.payload).id===queuedId,'capability-advertised connector receives queued business query');
    check(operationSchema.parse(query()).type==='business.query'&&commandCapability(query())==='business','strict new operation/capability');
    check(!operationSchema.safeParse({...query(),sql:'DELETE'}).success,'arbitrary SQL field rejected');
    check(!operationSchema.safeParse({...query(),days:2000}).success,'query budget bounded');
    check(statusSchema.parse({source:'unknown',version:'unknown',storage:'s3',nas:'unknown',connector:1}).business===undefined,'legacy heartbeat accepted without feature advertisement');
    const signed=signCommand(command,'fixture-token');check(verifyCommand(signed,'fixture-token',command.instanceId).operation.type==='business.query','signed query binds instance');
    const bad={...usage,users:Array(30).fill({...usage.users[0],email:'x'.repeat(254),name:'字'.repeat(80),role:'x'.repeat(24),plan:'x'.repeat(32)}),daily:Array.from({length:367},(_,i)=>({date:'2026-01-01',credits:1e15+i,operations:1e15}))};
    assert.throws(()=>parseFleetBusinessSnapshot(bad),/FLEET_BUSINESS_RESPONSE_TOO_LARGE/);checks++;
    check(resultSchema.parse({status:'failed',code:'UNAVAILABLE'}).status==='failed','unavailable distinct from succeeded zero');
    for(const key of envKeys)delete process.env[key];
    process.env.FLEET_SINGLE_APP_ORIGIN='http://naumi-app:3000';process.env.FLEET_ACTIVE_SLOTS_FILE='stale-file-must-not-be-used';
    let fetches=0;globalThis.fetch=async input=>{check(String(input)==='http://naumi-app:3000/api/version','explicit single origin used');fetches++;return Response.json({commit:'a'.repeat(40),version:'1793743896'});};
    const single=await localFleetStatus('s3');check(single.source==='a'.repeat(40)&&!Object.hasOwn(single,'business')&&fetches===1,'single Web actual source with legacy-compatible status before central confirmation');
    check(localAppOrigin('http://host.docker.internal:80')==='http://host.docker.internal','known same-host gateway supported without opening arbitrary origins');
    process.env.FLEET_SINGLE_APP_ORIGIN='http://host.docker.internal:80';process.env.FLEET_SINGLE_APP_HOST='47.105.59.142';
    globalThis.fetch=async(input,init)=>{
      check(String(input)==='http://host.docker.internal/api/version'&&new Headers(init?.headers).get('host')==='47.105.59.142','fixed local gateway carries validated site Host');
      check(init?.redirect==='error','local version redirects stay disabled');fetches++;return Response.json({commit:'b'.repeat(40),version:'1793743897'});
    };
    const hosted=await localFleetStatus('s3');check(hosted.source==='b'.repeat(40)&&fetches===2,'actual site version reached through stable local Host route');
    for(const host of ['47.105.59.142\r\nX-Injected: yes','http://47.105.59.142','47.105.59.142:80','47.105.59.142/path','metadata.google.internal','169.254.169.254','100.100.100.200','256.1.2.3','0.0.0.0','']){
      assert.throws(()=>localAppHost(host),/FLEET_LOCAL_HOST_REQUIRED/);checks++;
      if(host){process.env.FLEET_SINGLE_APP_HOST=host;const rejected=await localFleetStatus('s3');check(rejected.source==='unknown'&&fetches===2,'invalid Host blocked before fetch');}
    }
    delete process.env.FLEET_SINGLE_APP_HOST;
    process.env.FLEET_SINGLE_APP_ORIGIN='http://169.254.169.254';const invalid=await localFleetStatus('s3');check(invalid.source==='unknown'&&fetches===2,'untrusted origin blocked before fetch');
    checks+=await verifyFleetBusinessQueueCompatibility(pool,usage);
    console.log(`FLEET_BUSINESS_PROTOCOL=PASS assertions=${checks} REAL_PG=1 POOL_MAX=1 READ_ONLY_BUSINESS=1 APP_DDL=0 PAID_CALLS=0`);
  }finally{globalThis.fetch=originalFetch;for(const key of envKeys){const value=beforeEnv[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}await(await import('../src/platform/db/pool')).closeDatabasePools();await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
