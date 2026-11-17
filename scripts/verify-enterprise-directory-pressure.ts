import assert from 'node:assert/strict';
import {createServer,type Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

type Plan={['Relation Name']?:string;['Actual Loops']:number;['Shared Hit Blocks']?:number;['Shared Read Blocks']?:number;Plans?:Plan[]};
const walk=(p:Plan):Plan[]=>[p,...(p.Plans||[]).flatMap(walk)];
async function until<T>(read:()=>Promise<T>,match:(v:T)=>boolean,message:string,budget=2200){
 const deadline=Date.now()+budget;
 for(;;){const v=await read();if(match(v))return v;assert.ok(Date.now()<deadline,message+': '+String(v));await delay(12);}
}

async function main(){
 const baseline=process.argv.includes('--baseline'),qty=1800,owner='owner@directory-fixture.test',manager='manager@directory-fixture.test',
  outside='outside@directory-fixture.test',one='member-1@directory-fixture.test',paused='member-2@directory-fixture.test';
 Object.assign(process.env,{SETTINGS_SECRET:'fixture-directory-0123456789abcdef0123456789abcdef',NAUMI_MULTI_USER:'1',PGPOOL_MAX:'5'});
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 const guard=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000});
 let server:Server|undefined,locked=false,connected=false;
 const aborters:AbortController[]=[],calls:Promise<unknown>[]=[];
 try{
  const db=await import('../src/lib/db'),tenant=await import('../src/lib/saas/tenants');
  await tenant.ensureTenantSchema();
  for(const email of [owner,manager,outside]){
   await db.getOrCreateUser(email,email);
   await f.pool.query("INSERT INTO app_feature_access(email,mode,allowed) VALUES($1,'custom','[\"team\"]')",[email]);
  }
  const make=(email:string)=>tenant.createTenant({email:'local-admin',admin:true,consoleAdmin:true},{commandId:randomUUID(),
   name:email,ownerEmail:email,validUntil:null,seatLimit:null,entitlementName:null,featurePolicy:{team:true}});
  const {tenantId}=await make(owner),foreign=(await make(outside)).tenantId,role=randomUUID();
  await f.pool.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,'Manager',10,true,true)",[tenantId,role]);
  await f.pool.query(`INSERT INTO app_users(email,name,renews_at,credits_used)
    SELECT 'member-'||i||'@directory-fixture.test','Member '||lpad(i::text,5,'0'),now()+interval '1 year',2 FROM generate_series(1,$1::int) i`,[qty]);
  await f.pool.query(`INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment)
    VALUES($1,$2,$3,$4,'permanent')`,[tenantId,manager,owner,role]);
  await f.pool.query(`INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment,membership_status)
    SELECT $1,'member-'||i||'@directory-fixture.test',CASE WHEN i<=2 THEN $2 ELSE $3 END,'permanent',CASE WHEN i=2 THEN 'suspended' ELSE 'active' END
    FROM generate_series(1,$4::int) i`,[tenantId,manager,owner,qty]);
  await f.pool.query(`INSERT INTO app_credit_batches(id,email,amount,remaining,source,expires_at)
    SELECT 'batch-'||i||'-'||j,'member-'||i||'@directory-fixture.test',40,CASE WHEN j=3 THEN 0 ELSE 40 END,'admin',
      now()+CASE WHEN j=2 THEN interval '-1 day' ELSE interval '1 day' END
    FROM generate_series(1,$1::int) i CROSS JOIN generate_series(1,3) j`,[qty]);
  await f.pool.query(`INSERT INTO app_ledger(id,email,delta,reason,kind)
    SELECT 'ledger-'||i||'-'||j,'member-'||i||'@directory-fixture.test',(ARRAY[-2,-3,2,99,-1])[j],'fixture',
      (ARRAY['consume','consume','refund','consume','expire'])[j]
    FROM generate_series(1,$1::int+900) i CROSS JOIN generate_series(1,5) j`,[qty]);
  await f.pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,deleted_at)
    SELECT 'asset-'||i||'-'||j,'member-'||i||'@directory-fixture.test','Fixture','test','','/media/fixture.png','',
      CASE WHEN j=2 THEN now() ELSE NULL END
    FROM generate_series(1,$1::int+900) i CROSS JOIN generate_series(1,3) j`,[qty]);
  await f.pool.query('ANALYZE app_users; ANALYZE app_enterprise_members; ANALYZE app_ledger; ANALYZE app_credit_batches; ANALYZE app_artworks');
  const {GET}=await import('../src/app/api/enterprise/route'),{signUserSession}=await import('../src/lib/native-auth');
  const run=(page:'picker'|'directory',signal?:AbortSignal,email=owner,id=tenantId)=>
    GET(new Request('http://localhost/api/enterprise'+(page==='directory'?'?enterpriseId='+id:''),{signal,headers:{cookie:'nv_user='+signUserSession(email,Date.now())}}));
  assert.deepEqual((await (await run('picker')).json()).enterprises.map((t:{id:string})=>t.id),[tenantId]);
  assert.equal((await run('directory',undefined,owner,foreign)).status,403);
  let statement:{sql:string;values:unknown[]}|undefined,jitDisabled=false;
  const original=Client.prototype.query;
  Client.prototype.query=function(this:Client,...args:unknown[]){
   const sql=String(args[0]);if(sql.includes('AS legacy_metrics_state')&&sql.includes('app_ledger'))statement={sql,values:args[1] as unknown[]};
   if(sql==='SET LOCAL jit=off')jitDisabled=true;
   return Reflect.apply(original,this,args);
  } as Client['query'];
  const response=await run('directory').finally(()=>{Client.prototype.query=original;});
  assert.equal(response.status,200,await response.clone().text());
  const raw=await response.text(),result=JSON.parse(raw);
  const metrics=(email:string)=>{const m=result.members.find((m:{email:string})=>m.email===email);return [m.available,m.consumed,m.artworks,m.legacy_metrics_state];};
  assert.equal(result.members.length,qty+1);
  assert.deepEqual(metrics(one),[38,5,2,'recorded']);assert.deepEqual(metrics(paused),[null,null,null,'restricted']);
  const seeded=result.members.filter((m:{email:string})=>m.email.startsWith('member-')&&m.email!==paused);
  assert.equal(seeded.length,qty-1);
  for(const member of seeded)assert.deepEqual([member.available,member.consumed,member.artworks,member.legacy_metrics_state],[38,5,2,'recorded']);
  assert.ok(statement);
  const captured=statement;
  const analyze=async(disableJit:boolean)=>{
   const tx=await f.pool.connect();
   try{
    await tx.query('BEGIN READ ONLY');if(disableJit)await tx.query('SET LOCAL jit=off');
    const explain=await tx.query('EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON) '+captured.sql,captured.values);
    return explain.rows[0]['QUERY PLAN'][0] as {Plan:Plan;['Execution Time']:number;JIT?:{Functions:number}};
   }finally{await tx.query('ROLLBACK');tx.release();}
  };
  assert.equal(jitDisabled,!baseline);
  const explain=await analyze(jitDisabled);
  const scans=walk(explain.Plan).filter(p=>p['Relation Name']==='app_ledger').map(p=>p['Actual Loops']);
  console.log('ENTERPRISE_DIRECTORY_METRIC='+JSON.stringify({baseline,rows:result.members.length,bytes:Buffer.byteLength(raw),
   ms:explain['Execution Time'],buffers:(explain.Plan['Shared Hit Blocks']||0)+(explain.Plan['Shared Read Blocks']||0),ledgerLoops:scans,jitFunctions:explain.JIT?.Functions||0}));
  assert.ok(scans.length>0);
  if(!baseline)assert.ok(scans.every(loops=>loops<=12),'large directory repeatedly scans ledger: '+scans.join(','));
  if(process.argv.includes('--compare-jit')){
   const plan=await analyze(!jitDisabled);
   console.log('ENTERPRISE_DIRECTORY_ALT_JIT='+JSON.stringify({disabled:!jitDisabled,ms:plan['Execution Time'],jitFunctions:plan.JIT?.Functions||0}));
  }
  const managerRows=(await (await run('directory',undefined,manager)).json()).members;
  assert.deepEqual(managerRows.map((m:{email:string})=>m.email),[manager,one,paused]);
  await guard.connect();connected=true;
  const waiting=async()=>Number((await guard.query(`SELECT count(DISTINCT pid) AS n FROM pg_locks WHERE NOT granted
   AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND relation='app_enterprise_members'::regclass`)).rows[0].n);
  await guard.query('BEGIN; LOCK TABLE app_enterprise_members IN ACCESS EXCLUSIVE MODE');locked=true;
  const entered=new Set<string>(),done=new Map<string,number>();
  server=createServer(async(req,res)=>{
   const id=String(req.headers['x-fixture-id']);entered.add(id);
   try{
    const response=await run(Number(id)%2===0?'directory':'picker',signalFromNodeResponse(res));done.set(id,response.status);
    if(!res.destroyed){res.statusCode=response.status;res.end(await response.text());}
   }finally{entered.delete(id);}
  });
  await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+(server.address() as {port:number}).port;
  for(let i=0;i<5;i++){
   const ac=new AbortController();aborters.push(ac);
   calls.push(fetch(url,{headers:{'x-fixture-id':String(i)},signal:ac.signal}).catch(error=>error));
  }
  const max=baseline?5:2;
  await until(waiting,n=>n===max,'unexpected waiting reads');
  await until(async()=>entered.size,n=>n===5,'requests were not concurrent');
  if(!baseline){
   const probe=await Promise.race([f.pool.query('SELECT 1 AS n'),delay(300).then(()=>null)]);assert.equal(probe?.rows[0].n,1);
  }
  for(const ac of aborters)ac.abort();await Promise.all(calls);
  if(baseline){assert.equal(await waiting(),5);await guard.query('ROLLBACK');locked=false;}
  else{await until(waiting,n=>n===0,'disconnected SQL did not exit');assert.equal(locked,true);}
  await until(async()=>done.size,n=>n===5,'handlers did not finish',baseline?10_000:2200);
  if(!baseline)assert.deepEqual([...done.values()],Array(5).fill(499));
  console.log(baseline?'ENTERPRISE_DIRECTORY_BASELINE=PASS WAITS=5 DISCONNECT_RETAINS_SQL=1':
   'ENTERPRISE_DIRECTORY=PASS WAITS=2 DISCONNECT_RELEASE=1 LIVE_BUSINESS_POOL=1 LEGACY_FIELDS=1 REAL_PG=1');
 }finally{
  for(const ac of aborters)ac.abort();
  if(locked)await guard.query('ROLLBACK').catch(()=>{});
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  if(connected)await guard.end();
  await f.close();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
