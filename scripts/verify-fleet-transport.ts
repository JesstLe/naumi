import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {readFile} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import path from 'node:path';
import {fleetFetch,configuredCentralCA} from '../src/lib/fleet/transport';
async function main(){
  const tls=path.resolve('output/fleet-onboarding/tls'),address=Object.values(networkInterfaces()).flat().find(i=>i?.family==='IPv4'&&!i.internal)?.address;
  assert.ok(address,'isolated fixture needs a local interface');
  let mode='ok',requests=0;
  const server=createServer({key:await readFile(path.join(tls,'server.key')),cert:await readFile(path.join(tls,'server.pem'))},(req,res)=>{
    requests++;assert.ok(req.headers.host?.startsWith('fleet.fixture.test:'));assert.equal(req.headers.authorization,'Bearer fixture-only');
    if(mode==='redirect'){res.writeHead(302,{location:'https://untrusted.fixture.test'});res.end();return;}
    if(mode==='large'){res.end('x'.repeat(49000));return;}
    if(mode==='stall')return;
    res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,hostname:'fleet.fixture.test'}));
  });await new Promise<void>(resolve=>server.listen(0,address,resolve));const port=(server.address() as {port:number}).port,url='https://fleet.fixture.test:'+port+'/api/fleet/poll';
  const init={method:'POST',body:'{}',headers:{authorization:'Bearer fixture-only','content-type':'application/json'},signal:AbortSignal.timeout(10000)};
  try{
    process.env.FLEET_CENTRAL_RESOLVE_IP=address;delete process.env.FLEET_CENTRAL_CA_FILE;
    await assert.rejects(()=>fleetFetch(url,init));assert.equal(requests,0);
    process.env.FLEET_CENTRAL_CA_FILE=path.join(tls,'ca.pem');assert.equal((await fleetFetch(url,init)).status,200);assert.equal(requests,1);
    await assert.rejects(()=>fleetFetch(url.replace('fleet.fixture.test','wrong.fixture.test'),init));assert.equal(requests,1);
    process.env.FLEET_CENTRAL_CA_FILE=path.join(tls,'wrong.pem');await assert.rejects(()=>fleetFetch(url,init));assert.equal(requests,1);
    process.env.FLEET_CENTRAL_CA_FILE=path.join(tls,'server.pem');await assert.rejects(()=>configuredCentralCA());
    process.env.FLEET_CENTRAL_CA_FILE=path.join(tls,'missing.pem');await assert.rejects(()=>fleetFetch(url,init));assert.equal(requests,1);
    process.env.FLEET_CENTRAL_CA_FILE=path.join(tls,'ca.pem');for(const ip of ['169.254.169.254','100.100.100.200','127.0.0.1','::1']){process.env.FLEET_CENTRAL_RESOLVE_IP=ip;await assert.rejects(()=>fleetFetch(url,init));}
    process.env.FLEET_CENTRAL_RESOLVE_IP=address;await assert.rejects(()=>fleetFetch(url.replace('/api/fleet/poll','/admin'),init));await assert.rejects(()=>fleetFetch(url,{...init,method:'GET'}));
    await assert.rejects(()=>fleetFetch(url.replace('https://','https://secret@'),init));
    mode='redirect';await assert.rejects(()=>fleetFetch(url,init));mode='large';await assert.rejects(()=>fleetFetch(url,init));mode='stall';await assert.rejects(()=>fleetFetch(url,{...init,signal:AbortSignal.timeout(50)}));
    console.log('FLEET_TRANSPORT=PASS REAL_TLS=1 ORIGIN_IP_ROUTING=1 SNI_HOSTNAME_VERIFIED=1 PRIVATE_CA_VERIFIED=1 WRONG_CA_DENIED=1 WRONG_HOST_DENIED=1 NO_FAILOPEN=1 REDIRECT_DENIED=1 BYTE_LIMIT=1 TIMEOUT=1 METADATA_DENIED=1 PRODUCTION_WRITES=0');
  }finally{delete process.env.FLEET_CENTRAL_CA_FILE;delete process.env.FLEET_CENTRAL_RESOLVE_IP;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
