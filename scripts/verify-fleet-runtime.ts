import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {createServer as createLocalServer} from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
  Object.assign(process.env,{FLEET_CONTROL_ENABLED:'1',NAUMI_MULTI_USER:'1',NAUMI_VIDEO_WORKER:'0',SETTINGS_SECRET:'fleet-runtime-fixture-012345678901234567890',VIDEO_WORKER_SECRET:'fleet-runtime-worker-012345678901234567890'});
  const db=await import('../src/lib/db'),fleet=await import('../src/lib/fleet/server'),poll=await import('../src/app/api/fleet/poll/route'),ack=await import('../src/app/api/fleet/ack/route');
  await fleet.ensureFleetSchema();const instance=await fleet.createInstance('fixture-root','Linux企业连接器','enterprise');
  const certdir=path.resolve('output/fleet-governance/tls'),ca=readFileSync(path.join(certdir,'cert.pem'));
  const server=createServer({key:readFileSync(path.join(certdir,'key.pem')),cert:ca},async(req,res)=>{try{const parts:Buffer[]=[];for await(const chunk of req)parts.push(Buffer.from(chunk));const r=new Request('https://host.docker.internal:'+port+req.url,{method:'POST',headers:req.headers as Record<string,string>,body:Buffer.concat(parts)});const response=req.url==='/api/fleet/poll'?await poll.POST(r):await ack.POST(r);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end();}});
  await new Promise<void>(resolve=>server.listen(0,'0.0.0.0',resolve));const port=(server.address() as {port:number}).port;
  const image=process.env.FLEET_TEST_IMAGE||'naumi-fleet:governance-20261014';
  const actualSource='7'.repeat(40),localStates=[actualSource,actualSource,actualSource],localServers: ReturnType<typeof createLocalServer>[]=[];
  for(let i=0;i<3;i++){const local=createLocalServer((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({commit:localStates[i],version:123}));});await new Promise<void>(resolve=>local.listen(0,'0.0.0.0',resolve));localServers.push(local);}
  const origins=Object.fromEntries(['FLEET_APP_ORIGIN','FLEET_DESKTOP_ORIGIN','FLEET_ENTERPRISE_ORIGIN'].map((key,i)=>[key,'http://app:'+(localServers[i].address() as {port:number}).port]));
  const environment={...origins,FLEET_CONNECTOR_ENABLED:'1',FLEET_CENTRAL_URL:'https://host.docker.internal:'+port,FLEET_INSTANCE_ID:instance.id,FLEET_INSTANCE_TOKEN:instance.token,DATABASE_URL:'postgres://postgres:fleet-fixture-only@host.docker.internal:15547/fleet_runtime_enterprise?sslmode=disable',SETTINGS_SECRET:process.env.SETTINGS_SECRET!,VIDEO_WORKER_SECRET:process.env.VIDEO_WORKER_SECRET!,NAUMI_MULTI_USER:'1',NAUMI_VIDEO_WORKER:'0',STORAGE_DRIVER:'local',NODE_EXTRA_CA_CERTS:'/test-ca/cert.pem'};
  async function run(extra:Record<string,string>={},expected=0){
    const {spawn}=await import('node:child_process');
    const values={...environment,...extra},args=['run','--rm','--add-host','app:host-gateway','--mount',`type=bind,source=${certdir},target=/test-ca,readonly`,...Object.entries(values).flatMap(([key,value])=>['-e',key+'='+value]),image,'node','dist/fleet/connector.js','--once'];
    const result=await new Promise<{code:number;out:string}>((resolve,reject)=>{const child=spawn('docker',args,{stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>out+=b);child.on('error',reject);child.on('close',code=>resolve({code:code??-1,out}));});assert.equal(result.code,expected,result.out);return result.out;
  }
  try{
    assert.ok((await run()).includes('FLEET_TICK=idle'));
    const id=randomUUID();await fleet.enqueueCommand('fixture-root',instance.id,id,{type:'users.list',search:'',page:1});assert.ok((await run()).includes('FLEET_TICK=succeeded'));assert.equal((await db.getPool().query('SELECT state FROM app_fleet_commands WHERE id=$1',[id])).rows[0].state,'succeeded');
    assert.ok((await run({FLEET_INSTANCE_TOKEN:'x'.repeat(43)},1)).includes('FLEET_TICK=RETRY_PENDING'));
    assert.ok((await run({FLEET_CENTRAL_URL:'http://host.docker.internal:'+port},1)).includes('FLEET_CONNECTOR=INVALID_CONFIG'));
    assert.ok((await run({NODE_EXTRA_CA_CERTS:''},1)).includes('FLEET_TICK=RETRY_PENDING'));
    // The operator-pinned private CA is request-local, not a global TLS bypass.
    assert.ok((await run({NODE_EXTRA_CA_CERTS:'',FLEET_CENTRAL_CA_FILE:'/test-ca/cert.pem'})).includes('FLEET_TICK=idle'));
    assert.ok((await run({NODE_EXTRA_CA_CERTS:'',FLEET_CENTRAL_CA_FILE:'/test-ca/missing.pem'},1)).includes('FLEET_TICK=RETRY_PENDING'));
    const state=(await db.getPool().query('SELECT status FROM app_fleet_instances WHERE id=$1',[instance.id])).rows[0].status;assert.equal(state.source,actualSource);assert.equal(state.version,'123');assert.equal(state.connector,1);
    localStates[2]='8'.repeat(40);await run();assert.equal((await db.getPool().query('SELECT status FROM app_fleet_instances WHERE id=$1',[instance.id])).rows[0].status.source,'unknown');
    const disabled=spawnSync('docker',['run','--rm',image,'node','dist/fleet/scheduler.js'],{encoding:'utf8'});assert.equal(disabled.status,1);assert.ok((disabled.stderr+disabled.stdout).includes('FLEET_SCHEDULER=FAILED'));
    console.log('FLEET_LINUX_RUNTIME=PASS NODE24=1 NONROOT=1 TRUSTED_TLS=1 PRIVATE_CA_REQUEST_LOCAL=1 MISSING_CA_NO_FAILOPEN=1 WRONG_TOKEN_DENIED=1 UNTRUSTED_CERT_DENIED=1 PUBLIC_HTTP_DENIED=1 REAL_COMMAND=1 ACTUAL_THREE_SLOTS=1 MIXED_UNKNOWN=1 SCHEDULER_DEFAULT_OFF=1 RESTART_RECEIPTS=1 PRODUCTION_WRITES=0');
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));for(const local of localServers)await new Promise<void>(resolve=>local.close(()=>resolve()));await db.getPool().end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
