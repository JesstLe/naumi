/** Actual central API HOLD + explicit retained-row HTTP/ACK/source PG integration.
 * Positive business rows model previously accepted history, not open admission.
 * Only these two named loopback databases may be reset. No provider or SSH. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,type Server} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {Pool} from 'pg';
import type {FleetBusinessResponse} from '../src/lib/fleet/business-central-contracts';
import {seedRetainedFleetBusinessCommand} from './lib/fleet-business-retained-fixture';

const CENTRAL='fleet_central_103_20261104',SOURCE='fleet_source_47_20261104';
const FIXTURE='postgresql://postgres:fleet_protocol_fixture@127.0.0.1:65298/';
const EMAIL='same@fixture.test',ROOT='root@central.fixture',OTHER='other@central.fixture';
const OUT=path.resolve('output/fleet-business-data-20261104/central-integration');
const PRIVATE=path.resolve(process.env.USERPROFILE||homedir(),'.t3/userdata/task-evidence/fleet-business-data-103-20261104');
let checks=0;const names:string[]=[];
function check(value:unknown,message:string){assert.ok(value,message);checks++;names.push(message);}
const env={DATABASE_URL:FIXTURE+CENTRAL,NAUMI_VERIFY_ISOLATED_DB:'1',SETTINGS_SECRET:'fleet-central-fixture-secret-20261104-unique-0001',VIDEO_WORKER_SECRET:'fleet-source-fixture-worker-20261104-unique-0002',FLEET_CONTROL_ENABLED:'1',FLEET_ISOLATED_TEST:'1',NAUMI_MULTI_USER:'1',NAUMI_VIDEO_WORKER:'0',PGPOOL_MAX:'1'};

async function worker(input:unknown,db:string){
  const child=spawn(process.execPath,['--import','tsx','--conditions','react-server','scripts/verify-fleet-business-worker.ts'],{cwd:process.cwd(),env:{...process.env,...env,DATABASE_URL:FIXTURE+db},stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';child.stdout.setEncoding('utf8').on('data',s=>stdout+=s);child.stderr.setEncoding('utf8').on('data',s=>stderr+=s);child.stdin.end(JSON.stringify(input));
  const status=await new Promise<number|null>((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  assert.equal(status,0,stderr||stdout);return JSON.parse(stdout.trim());
}
async function fingerprint(pool:Pool){
  const result:Record<string,string>={};
  for(const table of ['app_users','app_ledger','app_credit_batches','app_billing_operations','app_orders','app_artworks'])
    result[table]=(await pool.query(`SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM ${table} t`)).rows[0].hash;
  result.catalog=(await pool.query("SELECT md5(string_agg(table_name||'.'||column_name||':'||data_type,',' ORDER BY table_name,ordinal_position)) hash FROM information_schema.columns WHERE table_schema='public'")).rows[0].hash;
  return result;
}
async function seedSource(pool:Pool){
  await pool.query(`CREATE TABLE app_users(email text PRIMARY KEY,name text,plan text DEFAULT 'starter',role text DEFAULT 'user',banned boolean DEFAULT false,credits_total int DEFAULT 0,credits_used int DEFAULT 0,auth_revoked_before timestamptz,account_expires_at timestamptz);
    CREATE TABLE app_settings(k text PRIMARY KEY,v text);
    CREATE TABLE app_ledger(id text PRIMARY KEY,email text,delta int,kind text,reason text,created_at timestamptz);
    CREATE TABLE app_credit_batches(id text PRIMARY KEY,email text,remaining int,expires_at timestamptz);
    CREATE TABLE app_billing_operations(id text PRIMARY KEY,email text,ledger_id text,feature text);
    CREATE TABLE app_orders(id text PRIMARY KEY,email text,title text,kind text,credits int,amount int,status text,created_at timestamptz,paid_at timestamptz);
    CREATE TABLE app_artworks(id text PRIMARY KEY,email text,title text,created_at timestamptz,group_id text,video_url text,status text,deleted_at timestamptz,image_url text);
    CREATE TABLE app_fleet_applied(id uuid PRIMARY KEY,fingerprint text NOT NULL,result jsonb NOT NULL,instance_id uuid,actor text,operation jsonb,created_at timestamptz DEFAULT now());
    INSERT INTO app_users(email,name,credits_total,credits_used)VALUES('${EMAIL}','47 用户',8888,5);
    INSERT INTO app_credit_batches VALUES('live','${EMAIL}',200,now()+interval '1 day'),('expired','${EMAIL}',900,now()-interval '1 day'),('negative','${EMAIL}',-50,now()+interval '1 day');
    INSERT INTO app_ledger VALUES('consume','${EMAIL}',-42,'consume','图片生成',now()-interval '1 hour'),('admin-legacy','${EMAIL}',-100,'consume','管理员调整积分',now()-interval '1 hour'),('admin-custom','${EMAIL}',-200,'consume','自定义后台扣减',now()-interval '1 hour'),('refund','${EMAIL}',5,'refund','退款',now()-interval '1 hour');
    INSERT INTO app_billing_operations VALUES('adjust-op','${EMAIL}','admin-custom','credits.adjust');
    INSERT INTO app_orders VALUES('paid','${EMAIL}','47 充值','pack',100,1200,'paid',now()-interval '1 day',now()-interval '23 hours'),('pending','${EMAIL}','待支付','pack',100,1200,'pending',now()-interval '1 day',null);
    INSERT INTO app_artworks VALUES('artwork47','${EMAIL}','47 商品图',now()-interval '1 hour','project47','','completed',null,'https://private.invalid/image47');`);
}

async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1','explicit isolated database flag required');
  const supplied=new URL(process.env.DATABASE_URL||FIXTURE+CENTRAL);
  assert.equal(supplied.hostname,'127.0.0.1');assert.equal(supplied.port,'65298');assert.equal(supplied.pathname,'/'+CENTRAL);
  Object.assign(process.env,env);delete process.env.FLEET_PORTAL_ONLY;delete process.env.NAUMI_AUTH_LOGIN_ONLY;
  for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FLEET_CENTRAL_RESOLVE_IP','FLEET_CENTRAL_CA_FILE','NAUMI_ENTERPRISE_SITE_ID','ENTERPRISE_SITE_ID'])delete process.env[key];
  await mkdir(OUT,{recursive:true});await mkdir(PRIVATE,{recursive:true});
  const admin=new Pool({connectionString:FIXTURE+'postgres',max:1});
  for(const db of [CENTRAL,SOURCE])if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[db])).rowCount)await admin.query(`CREATE DATABASE ${db}`);
  await admin.end();
  const central=new Pool({connectionString:FIXTURE+CENTRAL,max:1}),source=new Pool({connectionString:FIXTURE+SOURCE,max:1});
  let server:Server|undefined;
  const {getPool,closeDatabasePools}=await import('../src/platform/db/pool');
  try{
    for(const pool of [central,source])await pool.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');
    await seedSource(source);
    const {ensureSchema}=await import('../src/lib/persistence/schema');await ensureSchema();
    const {ensureFleetSchema,createInstance,changeInstance,FleetError,FLEET_BUSINESS_ADMISSION_HOLD}=await import('../src/lib/fleet/server');await ensureFleetSchema();
    const {ensurePostgresRateLimitSchema}=await import('../src/lib/rate-limit-store');await ensurePostgresRateLimitSchema(getPool());
    const {hashPassword,signSession}=await import('../src/lib/admin-auth');
    const {signUserSession}=await import('../src/lib/native-auth');
    const passwordHash=hashPassword('Explicit-fixture-password-20261104');
    await central.query("INSERT INTO app_settings(k,v)VALUES('admin_password_hash',$1),('multi_user_enabled','1')",[passwordHash]);
    await central.query("INSERT INTO app_users(email,name,renews_at,role,credits_total,credits_used)VALUES($1,'103 用户',now()+interval '1 year','user',9999,7),($2,'Root',now()+interval '1 year','admin',0,0),($3,'Other root',now()+interval '1 year','admin',0,0),('ordinary@fixture.test','Ordinary',now()+interval '1 year','user',0,0)",[EMAIL,ROOT,OTHER]);
    await central.query("INSERT INTO app_credit_batches(id,email,amount,remaining,source,expires_at)VALUES('live',$1,100,100,'fixture',now()+interval '1 day'),('expired',$1,900,900,'fixture',now()-interval '1 day'),('negative',$1,-50,-50,'fixture',now()+interval '1 day')",[EMAIL]);
    await central.query("INSERT INTO app_ledger(id,email,delta,kind,reason,created_at)VALUES('consume',$1,-7,'consume','图片生成',now()-interval '1 hour')",[EMAIL]);
    await central.query("INSERT INTO app_orders(id,email,kind,item_id,title,credits,amount,status,created_at,paid_at)VALUES('paid',$1,'pack','fixture','103 充值',20,600,'paid',now()-interval '1 day',now()-interval '23 hours')",[EMAIL]);
    await central.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,created_at,group_id)VALUES('artwork103',$1,'103 商品图','image','fixture','https://private.invalid/image103','',now()-interval '1 hour','artwork103')",[EMAIL]);
    const cookie=(email:string,admin=true)=>`${admin?'nv_admin='+signSession(Date.now(),passwordHash)+'; ':''}nv_user=${signUserSession(email,Date.now())}`;
    const rootCookie=cookie(ROOT),otherCookie=cookie(OTHER),userCookie=cookie('ordinary@fixture.test',false);
    const cookieFile=path.join(PRIVATE,'native-admin-cookie.txt');await writeFile(cookieFile,rootCookie,'utf8');
    const instance=await createInstance(ROOT,'47 企业站','enterprise');
    const actor={actor:ROOT,root:true};
    const businessRoute=await import('../src/app/api/admin/business/route');
    const genericFleetRoute=await import('../src/app/api/admin/fleet/route');
    const {startFleetBusinessQuery,pollFleetBusinessQuery}=await import('../src/lib/fleet/business-central');
    const pollRoute=await import('../src/app/api/fleet/poll/route');
    const ackRoute=await import('../src/app/api/fleet/ack/route');
    let httpPolls=0,httpAcks=0;
    server=createServer(async(req,res)=>{
      try{
        const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
        const origin=`http://127.0.0.1:${(server!.address() as {port:number}).port}`,url=origin+req.url;
        const request=new Request(url,{method:req.method,headers:req.headers as Record<string,string>,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
        const pathname=new URL(url).pathname;
        let response:Response;
        if(pathname==='/api/admin/business')response=await (req.method==='POST'?businessRoute.POST(request):businessRoute.GET(request));
        else if(pathname==='/api/admin/fleet')response=await genericFleetRoute.POST(request);
        else if(pathname==='/api/fleet/poll'){httpPolls++;response=await pollRoute.POST(request);}
        else if(pathname==='/api/fleet/ack'){httpAcks++;response=await ackRoute.POST(request);}
        else response=new Response('not found',{status:404});
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
      }catch(error){res.writeHead(500);res.end(String(error));}
    });
    await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const post=async(input:unknown,cookieValue=rootCookie,headers:Record<string,string>={})=>fetch(origin+'/api/admin/business',{method:'POST',headers:{'content-type':'application/json',cookie:cookieValue,origin,...headers},body:JSON.stringify(input)});
    const get=async(id:string,cookieValue=rootCookie)=>fetch(origin+'/api/admin/business?requestId='+encodeURIComponent(id),{headers:{cookie:cookieValue}});
    const businessCount=async()=>Number((await central.query("SELECT count(*)::int n FROM app_fleet_commands WHERE operation->>'type'='business.query'")).rows[0].n);
    // Only these explicitly named retained-history helpers seed synthetic rows.
    // Ordinary post/start and every rejected or unauthorized request stay raw.
    const seedHeldHistory=async(held:FleetBusinessResponse,before:number,label:string)=>{
      const remotes=held.sources.filter(s=>s.id!=='local');
      check(remotes.length===1&&remotes[0].id===instance.id&&remotes.every(s=>s.status==='unknown'&&s.error===FLEET_BUSINESS_ADMISSION_HOLD&&!s.data),label+': public API reports UNKNOWN/preparation HOLD without data');
      check(await businessCount()===before,label+': actual public call created zero business rows');
      for(const item of remotes){assert.ok(item.commandId);await seedRetainedFleetBusinessCommand(central,ROOT,item.id,item.commandId,held.query,actor);}
    };
    const postRetained=async(input:unknown)=>{
      const before=await businessCount(),raw=await post(input);assert.equal(raw.status,200);
      const held=await raw.json() as FleetBusinessResponse;await seedHeldHistory(held,before,'explicit postRetained');
      const response=await get(held.requestId);return{response,value:await response.json() as FleetBusinessResponse,held};
    };
    const startRetained=async(input:unknown)=>{
      const before=await businessCount(),held=await startFleetBusinessQuery(actor,input);await seedHeldHistory(held,before,'explicit startRetained');
      return pollFleetBusinessQuery(actor,held.requestId);
    };
    const request={site:'all',view:'usage',days:30,page:1,search:''};
    const status={source:'a'.repeat(40),version:'fixture',storage:'s3',nas:'unknown',connector:1};
    const tick=(advertise=true)=>worker({mode:'tick',options:{central:origin,instanceId:instance.id,token:instance.token,status:{...status,...(advertise?{business:1}:{})}}},SOURCE);
    const beforeCentral=await fingerprint(central),beforeSource=await fingerprint(source);

    check((await post(request,'')).status===403,'anonymous business API denied');
    check((await post(request,userCookie)).status===403,'nonroot native account denied');
    check((await post(request,rootCookie,{'sec-fetch-site':'cross-site'})).status===403,'cross-site POST denied');
    check((await post(request,rootCookie,{origin:'https://cross.invalid'})).status===403,'Origin mismatch denied');
    check((await fetch(origin+'/api/admin/business',{headers:{cookie:rootCookie}})).status===400,'GET missing opaque request denied');
    check((await post({...request,sql:'DELETE'})).status===400,'unrecognized query fields rejected');
    check((await tick(false)).state==='idle','actual legacy HTTP heartbeat accepted');
    const legacyResponse=await post(request);check(legacyResponse.status===200,'authenticated query route admitted');
    const legacy=await legacyResponse.json();check(legacy.sources.find((s:any)=>s.id===instance.id)?.status==='unknown','missing business:1 is unknown, not zero');
    check((await central.query('SELECT count(*)::int n FROM app_fleet_commands')).rows[0].n===0,'legacy connector does not enqueue business command');
    await tick();
    const genericId=randomUUID();
    const genericHeld=await fetch(origin+'/api/admin/fleet',{method:'POST',headers:{'content-type':'application/json',cookie:rootCookie,origin},body:JSON.stringify({action:'command',instanceId:instance.id,id:genericId,operation:{type:'business.query',view:'usage',days:30,asOf:new Date().toISOString(),page:1,search:''}})});
    check(genericHeld.status===503&&(await genericHeld.json()).error===FLEET_BUSINESS_ADMISSION_HOLD,'actual generic Fleet POST cannot bypass common closed business admission');
    check((await central.query('SELECT count(*)::int n FROM app_fleet_commands WHERE id=$1',[genericId])).rows[0].n===0,'generic Fleet rejection writes no command');
    const {response:startedResponse,value:started}=await postRetained(request);check(startedResponse.status===200&&started.sources[1].status==='pending','actual GET returns explicit retained pending query while public admission stays closed');
    const repeated=await startFleetBusinessQuery(actor,request,Date.parse(started.query.asOf)+100);check(repeated.sources[1].commandId===started.sources[1].commandId&&repeated.query.asOf===started.query.asOf,'same query window coalesces command ID');
    const executed=await tick();check(executed.state==='succeeded'&&executed.commandId===started.sources[1].commandId,'separate source process verifies signed command and ACKs');
    const response=await get(started.requestId);const finished=await response.json();check(response.status===200&&finished.complete,'central GET returns both actual database receipts');
    check(finished.sources.find((s:any)=>s.id==='local').data.totals.credits===7,'103 settled consumption is 7');
    check(finished.sources.find((s:any)=>s.id===instance.id).data.totals.credits===42,'47 settled consumption is 42');
    check(finished.sources.reduce((n:number,s:any)=>n+s.data.totals.credits,0)===49,'cross-site total is 49 without copying balances');
    const local=finished.sources[0].data,remote=finished.sources[1].data;
    check(local.users.find((u:any)=>u.email===EMAIL)?.balance===93&&remote.users.find((u:any)=>u.email===EMAIL)?.balance===195,'same email remains two site-scoped wallets 93 and 195');
    check(remote.totals.administrativeDebits===300&&remote.totals.refundCredits===5,'legacy/custom admin debits excluded and refund 5 separate');
    check(remote.totals.paidOrders===1&&remote.totals.paidAmount===1200,'remote paid orders count and cents preserved');
    check(httpPolls>=3&&httpAcks===1,'real HTTP poll and ACK route handlers exercised');
    check(!JSON.stringify(finished).includes('private.invalid')&&!JSON.stringify(finished).includes(instance.token),'business result excludes private media URLs and connector credential');

    for(const view of ['overview','users','orders','ledger','creations'] as const){
      const {response:queryResponse,value:pending}=await postRetained({...request,site:instance.id,view,email:EMAIL,refresh:true});
      check(queryResponse.status===200&&pending.sources[0].status==='pending','actual remote retained-row getter: '+view);
      await tick();const selected=await (await get(pending.requestId)).json();
      check(selected.complete&&selected.sources[0].data.view===view&&selected.sources[0].data.totals.credits===42,'actual source receipt selected: '+view);
      if(view==='users')check(selected.sources[0].data.users.length===1&&selected.sources[0].data.users[0].email===EMAIL,'site-specific user query preserves identity');
      if(view==='orders')check(selected.sources[0].data.orders.length===2,'actual order receipt contains paid and pending rows');
      if(view==='ledger')check(selected.sources[0].data.ledger.length===4,'actual ledger receipt retains all classifications');
      if(view==='creations')check(selected.sources[0].data.creations[0].id==='artwork47','actual creation metadata receipt');
    }

    const restarted=await worker({mode:'poll',actor,requestId:started.requestId},CENTRAL);
    check(restarted.complete&&restarted.sources[1].data.totals.credits===42,'opaque request survives actual fresh central process without side-map');
    const tokenTail=started.requestId.at(-1)==='0'?'1':'0';check((await get(started.requestId.slice(0,-1)+tokenTail)).status===400,'tampered request signature denied');
    check((await get(started.requestId,otherCookie)).status===403,'opaque request bound to original actor');
    await assert.rejects(()=>pollFleetBusinessQuery({actor:ROOT,root:false},started.requestId),(e:any)=>e instanceof FleetError&&e.status===403);checks++;names.push('revoked root context denied');
    await assert.rejects(()=>pollFleetBusinessQuery(actor,started.requestId,Date.now()+181000),(e:any)=>e.status===409);checks++;names.push('expired opaque request denied');
    const refresh=await startRetained({...request,site:instance.id,refresh:true});
    check(refresh.query.asOf!==started.query.asOf&&refresh.sources[0].commandId!==started.sources[1].commandId,'refresh makes new asOf and command');
    const timeout=await pollFleetBusinessQuery(actor,refresh.requestId,Date.parse(refresh.query.asOf)+91000);
    check(timeout.sources[0].status==='unknown'&&!timeout.sources[0].data,'timed out receipt remains unknown without zero snapshot');
    const originalReceipt=(await central.query('SELECT result FROM app_fleet_commands WHERE id=$1',[started.sources[1].commandId])).rows[0].result;
    const wrongReceipt=structuredClone(originalReceipt);wrongReceipt.data.business.asOf=new Date(Date.parse(started.query.asOf)-1000).toISOString();
    await central.query('UPDATE app_fleet_commands SET result=$2 WHERE id=$1',[started.sources[1].commandId,JSON.stringify(wrongReceipt)]);
    const mismatched=await (await get(started.requestId)).json();check(mismatched.sources[1].status==='unknown'&&!mismatched.sources[1].data,'mismatched remote asOf fails closed without zero data');
    await central.query('UPDATE app_fleet_commands SET result=$2 WHERE id=$1',[started.sources[1].commandId,JSON.stringify(originalReceipt)]);
    await changeInstance(ROOT,instance.id,'revoke');check((await get(started.requestId)).status===409,'disabled registry invalidates existing request');
    const disabled=await startFleetBusinessQuery(actor,{...request,site:instance.id,refresh:true});check(disabled.sources[0].status==='offline'&&!disabled.sources[0].data,'disabled connector is offline without zero snapshot');
    await assert.rejects(()=>tick(),/FLEET_CONNECTION_401/);checks++;names.push('revoked connector token fails actual HTTP authentication');
    await changeInstance(ROOT,instance.id,'enable');
    const extra=await createInstance(ROOT,'registry change','enterprise');check((await get(started.requestId)).status===409,'registry list change invalidates signed selection');
    await central.query('DELETE FROM app_fleet_audit WHERE instance_id=$1',[extra.id]);await central.query('DELETE FROM app_fleet_instances WHERE id=$1',[extra.id]);
    await central.query("UPDATE app_fleet_instances SET last_seen=now()-interval '5 minutes' WHERE id=$1",[instance.id]);
    const offline=await startFleetBusinessQuery(actor,{...request,site:instance.id,refresh:true});check(offline.sources[0].status==='offline'&&!offline.sources[0].data,'stale heartbeat is offline, never zero');
    await central.query('UPDATE app_fleet_instances SET last_seen=now() WHERE id=$1',[instance.id]);
    assert.deepEqual(await fingerprint(central),beforeCentral,'central business/catalog mutation');check(true,'six central business tables and catalog unchanged');
    assert.deepEqual(await fingerprint(source),beforeSource,'source business/catalog mutation');check(true,'six source business tables and source catalog unchanged');
    // Leave reusable fixture receipts: no queued timed-out command steals the
    // browser's next query, but retain the successful usage receipt.
    await central.query("DELETE FROM app_fleet_commands WHERE state='queued'");
    const manifest={result:'PASS',layer:'real-dual-PG-HTTP-connector-admin-API-retained-row-integration',publicBusinessAdmission:'HOLD',positiveBusinessRows:'explicit fixture-only previously accepted history',assertions:checks,checks:names,localCredits:7,remoteCredits:42,totalCredits:49,localBalance:93,remoteBalance:195,refundCredits:5,businessWrites:0,sourceDDL:0,paidCalls:0,httpPolls,httpAcks,databases:{central:CENTRAL,source:SOURCE},baseline:{central:beforeCentral,source:beforeSource},instanceId:instance.id,cookieFile};
    await writeFile(path.join(OUT,'RESULT.json'),JSON.stringify(manifest,null,2)+'\n');
    await writeFile(path.join(OUT,'RESPONSE.json'),JSON.stringify(finished,null,2)+'\n');
    await writeFile(path.join(PRIVATE,'fixture.json'),JSON.stringify({env,central:DATABASE_URL_FOR_UI(),source:FIXTURE+SOURCE,instance,actor,cookieFile},null,2)+'\n');
    await writeFile(path.join(PRIVATE,'fixture.env'),Object.entries(env).map(([key,value])=>key+'='+value).join('\n')+'\n');
    check(JSON.parse(await readFile(path.join(OUT,'RESULT.json'),'utf8')).result==='PASS','result artifact reopened');
    check(JSON.parse(await readFile(path.join(OUT,'RESPONSE.json'),'utf8')).complete===true,'actual response artifact reopened');
    check((await readFile(cookieFile,'utf8')).startsWith('nv_admin='),'private native auth fixture reopened');
    assert.ok((await readFile(path.join(PRIVATE,'fixture.env'),'utf8')).includes('DATABASE_URL='+FIXTURE+CENTRAL));
    manifest.assertions=checks;
    await writeFile(path.join(OUT,'RESULT.json'),JSON.stringify(manifest,null,2)+'\n');
    assert.equal(JSON.parse(await readFile(path.join(OUT,'RESULT.json'),'utf8')).assertions,checks);
    console.log(`FLEET_BUSINESS_CENTRAL=PASS assertions=${checks} REAL_PG=2 HTTP_POLL_ACK=1 LOCAL=7 REMOTE=42 TOTAL=49 BUSINESS_WRITES=0 SOURCE_DDL=0 PAID_CALLS=0 NEW_BUSINESS_ADMISSION=HOLD RETAINED_ROW_INTEGRATION=1`);
    console.log('RESULT='+path.join(OUT,'RESULT.json'));console.log('UI_FIXTURE='+path.join(PRIVATE,'fixture.json'));
  }finally{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));await closeDatabasePools();await Promise.all([central.end(),source.end()]);}
}
function DATABASE_URL_FOR_UI(){return FIXTURE+CENTRAL;}
main().catch(error=>{console.error(error);process.exitCode=1;});
