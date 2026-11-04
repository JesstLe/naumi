import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import path from 'node:path';
import {Pool} from 'pg';
import {parseFleetBusinessSnapshot,type FleetBusinessSnapshot} from '../src/lib/fleet/business-contracts';
import {verifyFleetBusinessControlPriority,type WithheldAck} from './verify-fleet-business-control-priority';

const workerFlag='--receipt-schema-worker';
async function worker(){
  const url=new URL(process.env.DATABASE_URL||'');
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'65298');
  assert.match(url.pathname,/^\/fleet_receipt_compat_[a-f0-9]{32}$/);
  const {closeDatabasePools}=await import('../src/platform/db/pool');
  try{
    const input=JSON.parse(readFileSync(0,'utf8'));
    const {connectorTick}=await import('../src/lib/fleet/connector');
    console.log(JSON.stringify(await connectorTick({...input,isolated:true})));
  }finally{await closeDatabasePools();}
}
if(process.argv.includes(workerFlag))void worker().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});

/** Real central HTTP and a separate max=1 connector process, using only a new
 * randomly named loopback DB. Existing central/source fixtures are untouched. */
export async function verifyFleetBusinessQueueCompatibility(central:Pool,sample:FleetBusinessSnapshot){
  const url=new URL(process.env.DATABASE_URL||'');
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'65298');assert.equal(url.pathname,'/fleet_protocol_fixture');
  const previousIsolated=process.env.FLEET_ISOLATED_TEST;process.env.FLEET_ISOLATED_TEST='1';
  const database='fleet_receipt_compat_'+randomUUID().replaceAll('-','');assert.match(database,/^fleet_receipt_compat_[a-f0-9]{32}$/);
  await central.query('CREATE DATABASE '+database);
  url.pathname='/'+database;const source=new Pool({connectionString:url.toString(),max:1});
  const sourceDisconnects:Promise<void>[]=[];
  source.on('connect',client=>sourceDisconnects.push(new Promise<void>(resolve=>client.once('end',resolve))));
  const service=await import('../src/lib/fleet/server');
  let droppedAck:string|null=null,lastWithheldAck:WithheldAck|null=null,polls=0,acks=0,checks=0;
  const check=(value:unknown,message:string)=>{assert.ok(value,message);checks++;};
  const server=createServer(async(request,response)=>{
    try{
      const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));const body=Buffer.concat(chunks).toString('utf8');
      const ack=request.url==='/api/fleet/ack';assert.ok(ack||request.url==='/api/fleet/poll');
      if(ack){acks++;const parsed=JSON.parse(body);if(parsed.commandId===droppedAck){lastWithheldAck=parsed;droppedAck=null;response.destroy();return;}}else polls++;
      const input=new Request('http://127.0.0.1:'+port+request.url,{method:'POST',headers:request.headers as Record<string,string>,body});
      const result=await service.connectorExchange(input,ack);response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(result));
    }catch(error){const failure=service.fleetFailure(error);response.writeHead(failure.status);response.end(await failure.text());}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;
  const tick=(instance:{id:string;token:string})=>new Promise<{code:number;stdout:string;stderr:string}>((resolve,reject)=>{
    const child=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','--conditions','react-server',path.resolve('scripts/verify-fleet-business-queue-compat.ts'),workerFlag],{
      env:{...process.env,DATABASE_URL:url.toString(),PGPOOL_MAX:'1',FLEET_PORTAL_ONLY:'1',FLEET_CONTROL_ENABLED:'1',FLEET_ISOLATED_TEST:'1'},stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',data=>stdout+=String(data));child.stderr.on('data',data=>stderr+=String(data));child.on('error',reject);child.on('close',code=>resolve({code:code??-1,stdout,stderr}));
    child.stdin.end(JSON.stringify({central:'http://127.0.0.1:'+port,instanceId:instance.id,token:instance.token,status:{source:'a'.repeat(40),version:'1',storage:'s3',nas:'unknown',connector:1,business:1}}));
  });
  const sourceState=async()=>(await source.query(`SELECT (SELECT md5(string_agg(table_name||'.'||column_name||':'||data_type,',' ORDER BY table_name,ordinal_position)) FROM information_schema.columns WHERE table_schema='public') schema_hash,
    (SELECT md5(string_agg(to_jsonb(u)::text,'' ORDER BY email)) FROM app_users u) users_hash`)).rows[0];
  const scenarios:{mode:string;instanceId:string;businessId:string;controlId:string;firstTick:{code:number;stdout:string;stderr:string};readOnlyPreserved:boolean;businessState:string;businessResult:unknown;controlState:string;lostAckCode:number;retryCode:number;banApplied:boolean;controlOnlyExpectedField:boolean;businessReceiptRows:number}[]=[];
  try{
    await source.query(`CREATE TABLE app_users(email text PRIMARY KEY,name text,role text DEFAULT 'user',banned boolean DEFAULT false,auth_revoked_before timestamptz,account_expires_at timestamptz);
      CREATE TABLE app_settings(k text PRIMARY KEY,v text);
      INSERT INTO app_users(email,name) VALUES('receipt-target@fixture.test','Receipt target');`);
    for(const mode of ['missing-table','missing-column']){
      await source.query("UPDATE app_users SET banned=false WHERE email='receipt-target@fixture.test'");
      if(mode==='missing-table')await source.query('DROP TABLE IF EXISTS app_fleet_applied');
      else await source.query(`CREATE TABLE IF NOT EXISTS app_fleet_applied(id uuid PRIMARY KEY,fingerprint text NOT NULL,result jsonb NOT NULL,instance_id uuid,actor text,operation jsonb,created_at timestamptz DEFAULT now());ALTER TABLE app_fleet_applied DROP COLUMN IF EXISTS operation`);
      const instance=await service.createInstance('root','Receipt '+mode,'enterprise'),businessId=randomUUID(),controlId=randomUUID();
      await service.enqueueCommand('root',instance.id,businessId,{type:'business.query',view:'usage',days:30,asOf:new Date().toISOString(),page:1,search:''});
      // Exercise the missing-schema read alone; priority between ready controls
      // and queued/leased reads has its own complete matrix below.
      await central.query("UPDATE app_fleet_commands SET created_at=now()-interval '1 minute' WHERE id=$1",[businessId]);
      const before=await sourceState(),firstTick=await tick(instance),after=await sourceState();
      const business=(await central.query('SELECT state,result FROM app_fleet_commands WHERE id=$1',[businessId])).rows[0];
      await service.enqueueCommand('root',instance.id,controlId,{type:'users.ban',email:'receipt-target@fixture.test',banned:true,expectedBanned:false});
      droppedAck=controlId;const lost=await tick(instance);
      await central.query("UPDATE app_fleet_commands SET leased_until=now()-interval '1 second' WHERE id=$1 AND state='leased'",[controlId]);
      const retry=await tick(instance);droppedAck=null;
      const control=(await central.query('SELECT state FROM app_fleet_commands WHERE id=$1',[controlId])).rows[0];
      const hasReceipt=(await source.query("SELECT to_regclass('app_fleet_applied') IS NOT NULL AS available")).rows[0].available;
      const receiptRows=hasReceipt?Number((await source.query('SELECT count(*) FROM app_fleet_applied WHERE id=$1',[businessId])).rows[0].count):0;
      const expectedControl=(await source.query("SELECT md5(string_agg((to_jsonb(u)||jsonb_build_object('banned',false))::text,'' ORDER BY email)) normalized_users_hash,bool_and(email='receipt-target@fixture.test' AND banned=true) expected_ban FROM app_users u")).rows[0];
      const result={mode,instanceId:instance.id,businessId,controlId,firstTick,readOnlyPreserved:JSON.stringify(before)===JSON.stringify(after),businessState:business.state,businessResult:business.result,controlState:control.state,lostAckCode:lost.code,retryCode:retry.code,banApplied:expectedControl.expected_ban===true,controlOnlyExpectedField:expectedControl.expected_ban===true&&expectedControl.normalized_users_hash===before.users_hash,businessReceiptRows:receiptRows};
      scenarios.push(result);console.log('FLEET_RECEIPT_SCHEMA_SCENARIO='+JSON.stringify(result));
    }
    const target=scenarios[0];
    const large=parseFleetBusinessSnapshot({...sample,users:Array.from({length:30},(_,i)=>({...sample.users[0],email:`fixture-${i}-`+'x'.repeat(230),name:'字'.repeat(80),role:'x'.repeat(24),plan:'x'.repeat(32)})),daily:Array.from({length:250},(_,i)=>({date:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),credits:1000000,operations:10000}))});
    const payload={status:'succeeded',data:{business:large}},businessIds=Array.from({length:120},()=>randomUUID());
    await central.query(`INSERT INTO app_fleet_commands(id,instance_id,actor,operation,fingerprint,state,result,created_at,requested_by_root)
      SELECT id,$2,'root',$3,'fixture-history-'||id,'succeeded',$4,now()+interval '1 minute',true FROM unnest($1::uuid[]) id`,[businessIds,target.instanceId,JSON.stringify({type:'business.query',view:'usage',days:30,asOf:sample.asOf,page:1,search:''}),JSON.stringify(payload)]);
    const root=await service.fleetSnapshot(),operator='receipt-operator@fixture.test';
    await central.query('INSERT INTO app_users(email,name) VALUES($1,$2) ON CONFLICT(email) DO NOTHING',[operator,'Receipt operator']);
    await service.saveGrant('root',{instanceId:target.instanceId,email:operator,allowed:['read','business'],expectedVersion:0,expiresAt:null});
    const delegated=await service.fleetSnapshot({actor:operator,root:false});
    const specific=await service.fleetReadCommand({actor:operator,root:false},target.instanceId,businessIds[0]);
    await service.saveGrant('root',{instanceId:target.instanceId,email:operator,allowed:['read'],expectedVersion:1,expiresAt:null});
    const readOnly=await service.fleetSnapshot({actor:operator,root:false});
    await assert.rejects(()=>service.fleetReadCommand({actor:operator,root:false},target.instanceId,businessIds[0]),/实例操作未授权/);checks++;
    const history={seededBusiness:120,eachBusinessBytes:Buffer.byteLength(JSON.stringify(payload)),rootCommands:root.commands.length,rootBusiness:root.commands.filter(c=>c.operation.type==='business.query').length,rootPreservesControls:scenarios.every(s=>root.commands.some(c=>c.id===s.controlId)),delegatedBusiness:delegated.commands.filter(c=>c.operation.type==='business.query').length,delegatedPreservesControl:delegated.commands.some(c=>c.id===target.controlId),readOnlyPreservesControl:readOnly.commands.some(c=>c.id===target.controlId),scopedPayloadAvailable:specific?.result?.data?.business!==undefined};
    console.log('FLEET_GENERIC_HISTORY_SCENARIO='+JSON.stringify(history));
    for(const scenario of scenarios){
      const result=scenario.businessResult as {status?:unknown;code?:unknown}|null;
      check(scenario.firstTick.code===0&&JSON.parse(scenario.firstTick.stdout).state==='failed',scenario.mode+' returns failed rather than throwing');
      check(scenario.businessState==='failed'&&result?.status==='failed'&&result.code==='UNAVAILABLE',scenario.mode+' ACK clears queue head');
      check(scenario.readOnlyPreserved,scenario.mode+' read phase preserves source schema and complete user row bytes');
      check(scenario.controlState==='succeeded'&&scenario.banApplied&&scenario.controlOnlyExpectedField,scenario.mode+' subsequent fixture control changes only the expected banned field');
      check(scenario.lostAckCode===1&&scenario.retryCode===0,scenario.mode+' control lost-ACK replay still succeeds without a second mutation');
      check(scenario.businessReceiptRows===0,scenario.mode+' does not require or fabricate a local read receipt');
    }
    check(history.rootBusiness===0&&history.rootPreservesControls,'root generic history excludes business before LIMIT100');
    check(history.delegatedBusiness===0&&history.delegatedPreservesControl,'business grant does not flood generic control history');
    check(history.readOnlyPreservesControl&&history.scopedPayloadAvailable,'ordinary read control history and explicit scoped business read remain available');
    checks+=await verifyFleetBusinessControlPriority({central,source,origin:'http://127.0.0.1:'+port,tick,
      dropAck:id=>{droppedAck=id;lastWithheldAck=null;},withheldAck:()=>lastWithheldAck});
    console.log(`FLEET_BUSINESS_QUEUE_COMPAT=PASS assertions=${checks} REAL_PG=2 REAL_HTTP=1 POOL_MAX=1 MISSING_TABLE_ACK=1 MISSING_COLUMN_ACK=1 READ_PHASE_DDL=0 READ_PHASE_USER_WRITES=0 CONTROL_BAN_EXPECTED=1 CONTROL_LOST_ACK_ONCE=1 BUSINESS_HISTORY_SEEDED=120 GENERIC_BUSINESS=0`);
    return checks;
  }finally{
    try{
      await new Promise<void>(resolve=>server.close(()=>resolve()));await source.end();
      // pg-pool end() drains its bookkeeping before every physical socket ends.
      // Do not terminate a still-closing idle client with DROP ... WITH (FORCE).
      await Promise.all(sourceDisconnects);
      assert.match(database,/^fleet_receipt_compat_[a-f0-9]{32}$/);await central.query('DROP DATABASE '+database);
      console.log(`FLEET_RECEIPT_FIXTURE_TEARDOWN=PASS PHYSICAL_ENDS=${sourceDisconnects.length} FORCED_DISCONNECTS=0`);
    }finally{
      if(previousIsolated===undefined)delete process.env.FLEET_ISOLATED_TEST;else process.env.FLEET_ISOLATED_TEST=previousIsolated;
    }
  }
}
