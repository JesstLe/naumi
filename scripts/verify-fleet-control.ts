import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { operationSchema, signCommand, verifyCommand, centralUrl } from '../src/lib/fleet/contracts';
async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
  process.env.FLEET_CONTROL_ENABLED='1';process.env.FLEET_ISOLATED_TEST='1';process.env.NAUMI_MULTI_USER='1';process.env.NAUMI_VIDEO_WORKER='0';process.env.SETTINGS_SECRET='fleet-isolated-settings-012345678901234567890';process.env.VIDEO_WORKER_SECRET='fleet-isolated-worker-012345678901234567890';
  const db=await import('../src/lib/db'),service=await import('../src/lib/fleet/server'),auth=await import('../src/lib/admin-auth'),native=await import('../src/lib/native-auth');
  const adminAPI=await import('../src/app/api/admin/fleet/route'),pollAPI=await import('../src/app/api/fleet/poll/route'),ackAPI=await import('../src/app/api/fleet/ack/route');
  await db.ensureSchema();await service.ensureFleetSchema();await db.getOrCreateUser('admin@central.test');await db.getOrCreateUser('staff@central.test');await db.setUserRole('admin@central.test','admin');await auth.setAdminPassword('fleet-central-fixture-password');
  const adminCookie='nv_admin='+await auth.authenticateAdminPassword('fleet-central-fixture-password');
  const cookie=(email:string)=>'nv_user='+native.signUserSession(email,Date.now());
  const request=(body?:unknown,email='admin@central.test',extra:Record<string,string>={})=>new Request('http://localhost/api/admin/fleet',{method:body?'POST':'GET',headers:{cookie:email?cookie(email)+(email==='admin@central.test'?'; '+adminCookie:''):'','content-type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await adminAPI.GET(request(undefined,''))).status,401);assert.equal((await adminAPI.GET(request(undefined,'staff@central.test'))).status,403);
  assert.equal((await adminAPI.POST(request({action:'create',name:'forged',kind:'enterprise'},'admin@central.test',{origin:'https://evil.test'}))).status,403);
  const registrationId=randomUUID();const registration=await adminAPI.POST(request({action:'create',id:registrationId,name:'47企业fixture',kind:'enterprise'}));assert.equal(registration.status,201);const {id:instanceId,token}=await registration.json();
  assert.equal((await adminAPI.POST(request({action:'create',id:registrationId,name:'duplicate',kind:'enterprise'}))).status,409);
  const other=await service.createInstance('admin@central.test','独立企业','enterprise');
  assert.throws(()=>operationSchema.parse({type:'shell',command:'id'}));assert.throws(()=>operationSchema.parse({type:'credits.adjust',email:'x@y.test',delta:1,reason:'x',endpoint:'http://private'}));
  assert.throws(()=>centralUrl('http://103.30.76.93'));assert.throws(()=>centralUrl('https://token@103.30.76.93'));assert.throws(()=>centralUrl('https://example.test/path'));assert.equal(centralUrl('https://example.test'),'https://example.test');
  const command={id:randomUUID(),instanceId,actor:'admin@central.test',expiresAt:Date.now()+300000,operation:{type:'users.list' as const,search:'',page:1}};
  const signed=signCommand(command,token);assert.equal(verifyCommand(signed,token,instanceId).id,command.id);assert.throws(()=>verifyCommand({...signed,payload:signed.payload.replace('users.list','users.ban')},token,instanceId));assert.throws(()=>verifyCommand(signed,token,other.id));assert.throws(()=>verifyCommand(signCommand({...command,expiresAt:Date.now()-1},token),token,instanceId));
  let dropAck=false,ackDropped=false;
  const server=createServer(async(req,res)=>{try {const parts:Buffer[]=[];for await(const chunk of req)parts.push(Buffer.from(chunk));const request=new Request('http://127.0.0.1:'+port+req.url,{method:'POST',headers:req.headers as Record<string,string>,body:Buffer.concat(parts)});if(dropAck&&req.url==='/api/fleet/ack'&&!ackDropped){ackDropped=true;res.destroy();return;}const response=req.url==='/api/fleet/poll'?await pollAPI.POST(request):await ackAPI.POST(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end();}});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port,central='http://127.0.0.1:'+port;
  const cluster=new Pool({connectionString:process.env.DATABASE_URL});const enterpriseName='fleet_enterprise_'+randomUUID().replaceAll('-','');await cluster.query('CREATE DATABASE '+enterpriseName);
  const enterpriseURL=new URL(process.env.DATABASE_URL!);enterpriseURL.pathname='/'+enterpriseName;
  async function worker(mode='tick',extra:Record<string,string>={},expected=0) {
    const output=await new Promise<{code:number;stdout:string;stderr:string}>((resolve,reject)=>{const child=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','--conditions','react-server','scripts/verify-fleet-worker.ts',mode],{env:{...process.env,DATABASE_URL:enterpriseURL.toString(),FLEET_CENTRAL_URL:central,FLEET_INSTANCE_ID:instanceId,FLEET_INSTANCE_TOKEN:token,...extra},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>resolve({code:code??-1,stdout,stderr}));});assert.equal(output.code,expected,output.stderr);return output.stdout?JSON.parse(output.stdout.trim().split('\n').at(-1)!):null;
  }
  const pollBody={nonce:randomUUID(),timestamp:Date.now(),status:{source:'6c7c120',version:'fixture',storage:'s3',nas:'unknown',connector:1}};
  async function rawPoll(body:unknown= pollBody,authToken=token,id=instanceId){return fetch(central+'/api/fleet/poll',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+authToken,'x-naumi-instance':id},body:JSON.stringify(body)});}
  try {
    await worker('seed');assert.equal((await rawPoll(pollBody,token,other.id)).status,401);assert.equal((await rawPoll()).status,200);assert.equal((await rawPoll()).status,409);
    assert.equal((await rawPoll({...pollBody,nonce:randomUUID(),timestamp:Date.now()-180000})).status,409);
    const queued=await adminAPI.POST(request({action:'command',instanceId,id:command.id,operation:command.operation}));assert.equal(queued.status,202);
    const replay=await adminAPI.POST(request({action:'command',instanceId,id:command.id,operation:command.operation}));assert.equal((await replay.json()).replayed,true);
    assert.equal((await adminAPI.POST(request({action:'command',instanceId,id:command.id,operation:{...command.operation,search:'changed'}}))).status,409);
    assert.equal((await worker()).state,'succeeded');let snapshot=await service.fleetSnapshot();const listing=snapshot.commands.find(c=>c.id===command.id);assert.equal(listing.state,'succeeded');assert.equal(listing.result.data.users.length,2);assert.equal(snapshot.instances.find(i=>i.id===instanceId).status.storage,'s3');assert.ok(!JSON.stringify(snapshot).includes(token));assert.ok(!JSON.stringify(snapshot).includes('token_hash'));
    const initialEnterprise=Number((await worker('inspect')).user.creditsTotal),initialCentral=(await db.getUser('staff@central.test'))!.creditsTotal;
    const creditId=randomUUID();await service.enqueueCommand('admin@central.test',instanceId,creditId,{type:'credits.adjust',email:'staff@enterprise.test',delta:500,reason:'企业fixture积分'});
    dropAck=true;await worker('tick',{},1);assert.equal(ackDropped,true);let observed=await worker('inspect');assert.equal(Number(observed.user.creditsTotal),initialEnterprise+500);
    // Lost HTTP acknowledgement is retried without a second grant.
    await db.getPool().query("UPDATE app_fleet_commands SET leased_until=now()-interval '1 second' WHERE id=$1",[creditId]);dropAck=false;assert.equal((await worker()).state,'succeeded');observed=await worker('inspect');assert.equal(Number(observed.user.creditsTotal),initialEnterprise+500);assert.equal((await db.getUser('staff@central.test'))!.creditsTotal,initialCentral);
    // Simulate a crash after the ledger commit but before the outer local receipt.
    const enterprise=new Pool({connectionString:enterpriseURL.toString()});await enterprise.query('DELETE FROM app_fleet_applied WHERE id=$1',[creditId]);await enterprise.end();
    const creditReplay={id:creditId,instanceId,actor:'admin@central.test',expiresAt:Date.now()+300000,operation:{type:'credits.adjust',email:'staff@enterprise.test',delta:500,reason:'企业fixture积分'}};
    assert.equal((await worker('direct',{FLEET_TEST_COMMAND:JSON.stringify(creditReplay)})).status,'succeeded');assert.equal(Number((await worker('inspect')).user.creditsTotal),initialEnterprise+500);
    const banId=randomUUID();await service.enqueueCommand('admin@central.test',instanceId,banId,{type:'users.ban',email:'staff@enterprise.test',banned:true,expectedBanned:false});assert.equal((await worker()).state,'succeeded');assert.equal((await worker('inspect')).user.banned,true);
    await service.enqueueCommand('admin@central.test',instanceId,randomUUID(),{type:'users.ban',email:'owner@enterprise.test',banned:true,expectedBanned:false});assert.equal((await worker()).state,'failed');
    const featureId=randomUUID();await service.enqueueCommand('admin@central.test',instanceId,featureId,{type:'features.set',email:'staff@enterprise.test',mode:'custom',allowed:['canvas','works'],expectedVersion:0});assert.equal((await worker()).state,'succeeded');assert.deepEqual((await worker('inspect')).policy.allowed,['canvas','works']);
    await service.enqueueCommand('admin@central.test',instanceId,randomUUID(),{type:'features.set',email:'staff@enterprise.test',mode:'custom',allowed:[],expectedVersion:0});assert.equal((await worker()).state,'failed');
    await service.changeInstance('admin@central.test',instanceId,'revoke');assert.equal((await rawPoll({...pollBody,nonce:randomUUID()})).status,401);
    await service.changeInstance('admin@central.test',instanceId,'enable');const rotated=await service.changeInstance('admin@central.test',instanceId,'rotate');assert.equal((await rawPoll({...pollBody,nonce:randomUUID()})).status,401);assert.equal((await rawPoll({...pollBody,nonce:randomUUID()},rotated.token!)).status,200);
    snapshot=await service.fleetSnapshot();assert.ok(snapshot.audit.some(a=>a.action==='rotate'));assert.ok(snapshot.commands.some(c=>c.id===creditId&&c.state==='succeeded'));
    console.log('FLEET_E2E=PASS TWO_DATABASES=1 REAL_HTTP=1 AUTH=1 CROSS_INSTANCE_DENIED=1 SIGNATURE=1 REPLAY_DENIED=1 CREDIT_RETRY_ONCE=1 BAN=1 FEATURES_CAS=1 ROTATION=1 AUDIT=1 MODEL_CALLS=0 PRODUCTION_WRITES=0');
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await cluster.query('DROP DATABASE '+enterpriseName+' WITH (FORCE)');await cluster.end();await db.getPool().end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
